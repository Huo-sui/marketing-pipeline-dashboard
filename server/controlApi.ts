import Busboy from "busboy";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { Plugin } from "vite";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { checkDatabase, DatabaseUnavailableError, getPrismaClient } from "./db/client.js";
import { ensureWorkspace, workspaceSnapshot } from "./db/repositories/workspaceRepository.js";
import { AutoGlmProviderError, autoGlmProviderStatus, testAutoGlmProvider } from "./providers/zhipuAutoGlmProvider.js";
import { emptyPlatformDiscovery, getPlatformAdapter, listPlatformAdapters, platformAdapterStatus } from "./platforms.js";
import { engagementAgeBucket, scorePositiveEngagementOutlier } from "./scoring/robustAnomaly.js";
import { LocalArtifactStorage, ArtifactStorageError, validateArtifactName } from "./storage/LocalArtifactStorage.js";
import { numberInput, objectInput, optionalString, requiredString, stringArray, uuidParam, ValidationError } from "./validation/input.js";

const BASE = "/api/v1";
const storage = new LocalArtifactStorage();
let workspaceId: string | undefined = process.env.MARKETING_PIPELINE_WORKSPACE_ID;
const allowedMimeTypes = new Set(["image/gif", "image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/wav", "video/mp4", "video/quicktime", "video/webm", "application/json", "text/plain"]);

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body, (_, value) => typeof value === "bigint" ? value.toString() : value));
}

function errorResponse(response: ServerResponse, error: unknown) {
  let status = 500;
  let code = "INTERNAL_ERROR";
  if (error instanceof DatabaseUnavailableError || error instanceof Prisma.PrismaClientInitializationError) {
    status = 503;
    code = "DATABASE_UNAVAILABLE";
  } else if (error instanceof ValidationError) {
    status = 400;
    code = error.code;
  } else if (error instanceof AutoGlmProviderError) {
    status = error.status;
    code = error.code;
  } else if (error instanceof ArtifactStorageError) {
    status = 422;
    code = error.code;
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") { status = 409; code = "CONFLICT"; }
    else if (error.code === "P2025") { status = 404; code = "NOT_FOUND"; }
    else if (error.code === "P2003") { status = 409; code = "FOREIGN_KEY_CONSTRAINT"; }
    else code = "DATABASE_ERROR";
  }
  json(response, status, { error: { code, message: error instanceof Error ? error.message : "Control API 执行失败" } });
}

async function bodyJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; } catch { throw new ValidationError("请求体不是有效 JSON"); }
}

function idempotencyKey(request: IncomingMessage, input: Record<string, unknown>) {
  const header = request.headers["idempotency-key"];
  const value = typeof header === "string" ? header : input.idempotencyKey;
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : undefined;
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_, item) => item instanceof Date ? item.toISOString() : typeof item === "bigint" ? item.toString() : item)) as Prisma.InputJsonValue;
}

async function currentWorkspace() {
  const db = getPrismaClient();
  const workspace = await ensureWorkspace(db, workspaceId);
  workspaceId = workspace.id;
  return { db, workspace };
}

async function requireProject(db: PrismaClient, workspaceId: string, projectId: string) {
  const project = await db.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) throw new ValidationError("项目不存在或不属于当前 Workspace");
  return project;
}

function mapProject(project: { id: string; name: string; type: string; stage: string; description: string; targetMarkets: string[]; languages: string[]; platforms: string[]; timezone: string; status: string; promptPackVersion: string | null; createdAt: Date; updatedAt: Date }) {
  return { ...project, accountIds: [], topics: 0, channels: project.platforms.length, cadence: "待配置", locale: project.languages.join(" / "), assetCount: 0 };
}

function normalizeTopic(input: Record<string, unknown>) {
  const terms = stringArray(input.terms ?? [], "terms");
  if (!terms.length) throw new ValidationError("追踪规则至少需要一个追踪词");
  const bindingId = typeof input.collectorAccountBindingId === "string" && input.collectorAccountBindingId.trim()
    ? uuidParam(input.collectorAccountBindingId, "collectorAccountBindingId")
    : undefined;
  return {
    name: requiredString(input.name, "name", 200),
    platform: requiredString(input.platform, "platform", 50),
    terms,
    excludeTerms: stringArray(input.excludeTerms ?? [], "excludeTerms"),
    searchMode: input.searchMode === "sequential" ? "sequential" : "sequential",
    cadence: requiredString(input.cadence, "cadence", 100),
    state: input.state === "paused" ? "paused" : "running",
    minLikes: numberInput(input.minLikes, "minLikes", 0),
    minComments: numberInput(input.minComments, "minComments", 0),
    maxAgeHours: numberInput(input.maxAgeHours, "maxAgeHours", 24, 1),
    minScore: numberInput(input.minScore, "minScore", 0, 0, 100),
    anomalyEnabled: input.anomalyEnabled !== false,
    anomalyMethod: input.anomalyMethod === "robust_mad" ? "robust_mad" : "robust_mad",
    anomalyBaselineDays: numberInput(input.anomalyBaselineDays, "anomalyBaselineDays", 30, 7, 365),
    anomalyMinSamples: numberInput(input.anomalyMinSamples, "anomalyMinSamples", 30, 10, 10_000),
    anomalyZThreshold: numberInput(input.anomalyZThreshold, "anomalyZThreshold", 3.5, 1, 10),
    collectorAccountBindingId: bindingId,
  };
}

async function topicPreflight(topicWatchId: string) {
  const { db, workspace } = await currentWorkspace();
  const topic = await db.topicWatch.findFirstOrThrow({ where: { id: topicWatchId, workspaceId: workspace.id } });
  const binding = topic.collectorAccountBindingId
    ? await db.projectAccountBinding.findFirst({ where: { id: topic.collectorAccountBindingId, workspaceId: workspace.id, projectId: topic.projectId } })
    : null;
  const account = binding ? await db.socialAccount.findFirst({ where: { id: binding.accountId, workspaceId: workspace.id, lifecycleStatus: "active" } }) : null;
  const runner = account ? await db.accountRunner.findFirst({ where: { accountId: account.id, workspaceId: workspace.id } }) : null;
  const provider = autoGlmProviderStatus();
  const adapter = platformAdapterStatus(topic.platform);
  const requirements = adapter.requirements;
  const checks = [
    { key: "platform", label: "平台", ok: adapter.configured && adapter.capabilities.discovery, detail: adapter.detail },
    { key: "terms", label: "追踪词", ok: topic.terms.length > 0, detail: topic.terms.length ? `将按顺序搜索 ${topic.terms.join(" → ")}` : "没有可执行的追踪词" },
    { key: "provider", label: "视觉 Provider", ok: !requirements.visualProvider || provider.configured, detail: !requirements.visualProvider ? "当前 Adapter 使用确定性 UI Playbook，不要求视觉 Provider" : provider.configured ? `${provider.label} · ${provider.model}` : "服务端未配置 ZHIPU_API_KEY" },
    { key: "binding", label: "采集账号", ok: !requirements.accountBinding || Boolean(binding && binding.roles.includes("discovery")), detail: !requirements.accountBinding ? "当前 Adapter 不要求账号绑定" : binding ? (binding.roles.includes("discovery") ? "已绑定 Discovery 账号" : "所选账号没有 Discovery 角色") : "规则尚未指定采集账号" },
    { key: "identity", label: "账号身份", ok: !requirements.confirmedIdentity || Boolean(account && account.platform === topic.platform && account.identityConfirmedAt), detail: !requirements.confirmedIdentity ? "当前 Adapter 不要求确认账号身份" : account ? (account.platform !== topic.platform ? `账号平台为 ${account.platform}` : account.identityConfirmedAt ? `${account.displayName || account.handle || account.label} 已确认` : "账号身份尚未确认") : "未找到有效账号" },
    { key: "runner", label: "手机会话", ok: !requirements.phoneRunner || Boolean(runner?.sessionStatus === "healthy" && runner.deviceId && runner.appPackage), detail: !requirements.phoneRunner ? "当前 Adapter 不要求手机 Runner" : runner ? `${runner.deviceModel || runner.deviceId || "未分配设备"} · ${runner.sessionStatus}` : "未找到账号 Runner" },
  ];
  return { ready: checks.every((check) => check.ok), checks };
}

async function runTopicWatch(request: IncomingMessage, response: ServerResponse, topicWatchId: string) {
  const { db, workspace } = await currentWorkspace();
  uuidParam(topicWatchId, "topicWatchId");
  const topic = await db.topicWatch.findFirstOrThrow({ where: { id: topicWatchId, workspaceId: workspace.id } });
  const preflight = await topicPreflight(topicWatchId);
  const input = objectInput(await bodyJson(request));
  const traceId = optionalString(input.traceId, "traceId", 200) ?? randomUUID();
  const failedCheck = preflight.checks.find((check) => !check.ok);
  const binding = topic.collectorAccountBindingId ? await db.projectAccountBinding.findFirst({ where: { id: topic.collectorAccountBindingId, workspaceId: workspace.id, projectId: topic.projectId } }) : null;
  const account = binding ? await db.socialAccount.findFirst({ where: { id: binding.accountId, workspaceId: workspace.id, lifecycleStatus: "active" } }) : null;
  const runner = account ? await db.accountRunner.findFirst({ where: { accountId: account.id, workspaceId: workspace.id } }) : null;
  let discovery = emptyPlatformDiscovery();
  let discovered = discovery.posts;
  let errorCode = failedCheck ? `PREFLIGHT_${failedCheck.key.toUpperCase()}` : "";
  let errorMessage = failedCheck ? `${failedCheck.label}未就绪：${failedCheck.detail}` : "";
  if (!failedCheck) {
    try {
      const adapter = getPlatformAdapter(topic.platform);
      if (!adapter) throw new Error(`${topic.platform} 平台 Adapter 未注册`);
      const adapterStatus = adapter.status();
      discovery = await adapter.discover(account?.id ?? "api", topic.terms, runner?.deviceId ?? undefined);
      for (const post of discovery.posts) {
        const missing = adapterStatus.extraction.requiredFields.filter((field) => {
          const value = post[field];
          if (field === "likes" || field === "comments") return typeof value !== "number" || !Number.isFinite(value) || value < 0;
          if (field === "rawPayload") return !value || typeof value !== "object" || Array.isArray(value);
          if (field === "publishedAt") return typeof value !== "string" || !value.trim() || Number.isNaN(new Date(value).getTime());
          return typeof value !== "string" || !value.trim();
        });
        if (missing.length) throw new Error(`${topic.platform} Adapter 违反采集字段合同：${post.externalId || "未知候选"} 缺少 ${missing.join("、")}`);
      }
      const capturedPosts = discovery.posts;
      const qualificationLogs = capturedPosts.flatMap((post) => {
        const reasons: string[] = [];
        if (post.likes < topic.minLikes) reasons.push(`点赞 ${post.likes} < ${topic.minLikes}`);
        if (post.comments < topic.minComments) reasons.push(`评论 ${post.comments} < ${topic.minComments}`);
        if (post.publishedAt) {
          const ageHours = Math.max(0, (Date.now() - new Date(post.publishedAt).getTime()) / 3_600_000);
          if (ageHours > topic.maxAgeHours) reasons.push(`发布时间距今 ${ageHours.toFixed(1)}h > ${topic.maxAgeHours}h`);
        }
        const score = Math.min(100, (topic.minLikes > 0 ? post.likes / topic.minLikes * 50 : 50) + (topic.minComments > 0 ? post.comments / topic.minComments * 50 : 50));
        if (score < topic.minScore) reasons.push(`评分 ${score.toFixed(1)} < ${topic.minScore}`);
        return [{ post, reasons, score }];
      });
      const qualified = qualificationLogs.filter((item) => item.reasons.length === 0);
      discovered = qualified.map((item) => item.post);
      discovery.logs.push(...qualificationLogs.map((item) => ({ timestamp: new Date().toISOString(), level: item.reasons.length ? "info" as const : "info" as const, eventType: item.reasons.length ? "post_skipped" : "post_qualified", message: item.reasons.length ? `跳过帖子：${item.reasons.join("；")}` : `帖子通过硬阈值（评分 ${item.score.toFixed(1)}）`, payload: { externalId: item.post.externalId, likes: item.post.likes, comments: item.post.comments, publishedAt: item.post.publishedAt, score: item.score, reasons: item.reasons } })));
      discovery.logs.push({ timestamp: new Date().toISOString(), level: "info", eventType: "qualification_summary", message: `硬阈值筛选完成：真实抓取 ${capturedPosts.length} 条，合格 ${discovered.length} 条`, payload: { captured: capturedPosts.length, qualified: discovered.length } });
      const failedSearch = discovery.logs.findLast((event) => event.level === "error" && event.eventType === "search_failed");
      if (!discovered.length && failedSearch) {
        errorCode = "DISCOVERY_EXECUTION_FAILED";
        errorMessage = failedSearch.message;
      }
    } catch (error) {
      errorCode = "DISCOVERY_EXECUTION_FAILED";
      errorMessage = error instanceof Error ? error.message : `${topic.platform} Discovery 执行失败`;
    }
  }
  const run = await db.$transaction(async (tx) => {
    const startedAt = new Date();
    const status = errorCode ? "failed" : "completed";
    const adapterProvider = getPlatformAdapter(topic.platform)?.id ?? `${topic.platform.toLowerCase()}-unregistered`;
    const collection = await tx.collectionRun.create({ data: { workspaceId: workspace.id, projectId: topic.projectId, topicWatchId: topic.id, provider: adapterProvider, traceId, inputSnapshot: normalizeJson({ topicWatchId, terms: topic.terms, platform: topic.platform, preflight }), status, errorCode: errorCode || undefined, errorMessage: errorMessage || undefined, startedAt, completedAt: new Date() } });
    let outputCount = 0;
    if (!errorCode) {
      const baselineSince = new Date(startedAt.getTime() - topic.anomalyBaselineDays * 86_400_000);
      const matches = topic.anomalyEnabled ? await tx.sourcePostMatch.findMany({ where: { workspaceId: workspace.id, projectId: topic.projectId, topicWatchId: topic.id } }) : [];
      const matchedSourceIds = [...new Set(matches.map((item) => item.sourcePostId))];
      const baselinePosts = matchedSourceIds.length ? await tx.sourcePost.findMany({ where: { id: { in: matchedSourceIds }, workspaceId: workspace.id, projectId: topic.projectId, platform: topic.platform, publishedAt: { not: null } } }) : [];
      const baselinePostById = new Map(baselinePosts.map((item) => [item.id, item]));
      const historical = baselinePosts.length ? await tx.sourceMetricSnapshot.findMany({ where: { workspaceId: workspace.id, projectId: topic.projectId, sourcePostId: { in: baselinePosts.map((item) => item.id) }, capturedAt: { gte: baselineSince } }, orderBy: { capturedAt: "desc" } }) : [];
      for (const post of discovered) {
        const score = Math.min(100, (topic.minLikes > 0 ? post.likes / topic.minLikes * 50 : 50) + (topic.minComments > 0 ? post.comments / topic.minComments * 50 : 50));
        const candidateAgeHours = post.publishedAt ? Math.max(1, (startedAt.getTime() - new Date(post.publishedAt).getTime()) / 3_600_000) : undefined;
        const candidateBucket = candidateAgeHours === undefined ? undefined : engagementAgeBucket(candidateAgeHours);
        const seenSources = new Set<string>();
        const cohort = historical.flatMap((item) => {
          if (seenSources.has(item.sourcePostId)) return [];
          const baselinePost = baselinePostById.get(item.sourcePostId);
          if (!baselinePost?.publishedAt || baselinePost.externalId === post.externalId || item.likes === null || item.comments === null) return [];
          const raw = item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload) ? item.rawPayload as Record<string, unknown> : undefined;
          if (raw?.term !== post.term) return [];
          const ageHours = Math.max(1, (item.capturedAt.getTime() - baselinePost.publishedAt.getTime()) / 3_600_000);
          if (engagementAgeBucket(ageHours) !== candidateBucket) return [];
          seenSources.add(item.sourcePostId);
          return [{ likes: item.likes, comments: item.comments, ageHours }];
        });
        const anomaly = !topic.anomalyEnabled ? undefined
          : candidateAgeHours === undefined ? { state: "missing_published_at" as const, cohortSize: cohort.length }
          : scorePositiveEngagementOutlier({ likes: post.likes, comments: post.comments, ageHours: candidateAgeHours }, cohort, { minSamples: topic.anomalyMinSamples, zThreshold: topic.anomalyZThreshold });
        const reason = anomaly?.state === "positive_outlier" ? `同平台同话题正向异常：z=${anomaly.score.toFixed(2)}`
          : anomaly?.state === "insufficient_baseline" ? `达到硬阈值；相对异常基线不足（${anomaly.cohortSize}/${topic.anomalyMinSamples}）`
          : anomaly?.state === "normal" ? `达到硬阈值；相对异常正常（z=${anomaly.score.toFixed(2)}）`
          : anomaly?.state === "missing_published_at" ? "达到硬阈值；缺少发布时间，未计算相对异常"
          : score >= topic.minScore ? "达到硬阈值" : "未达到硬阈值";
        const source = await tx.sourcePost.upsert({ where: { platform_externalId: { platform: topic.platform, externalId: post.externalId } }, create: { workspaceId: workspace.id, projectId: topic.projectId, platform: topic.platform, externalId: post.externalId, canonicalUrl: post.canonicalUrl, canonicalHash: post.canonicalUrl, author: post.author, title: post.title, publishedAt: post.publishedAt ? new Date(post.publishedAt) : undefined, mediaType: post.mediaType, rawPayload: normalizeJson(post.rawPayload) }, update: { projectId: topic.projectId, canonicalUrl: post.canonicalUrl, author: post.author, title: post.title, publishedAt: post.publishedAt ? new Date(post.publishedAt) : undefined, mediaType: post.mediaType, rawPayload: normalizeJson(post.rawPayload) } });
        await tx.sourceMetricSnapshot.create({ data: { workspaceId: workspace.id, projectId: topic.projectId, sourcePostId: source.id, likes: post.likes, comments: post.comments, score, rawPayload: normalizeJson({ term: post.term, anomaly }) } });
        await tx.sourcePostMatch.upsert({ where: { sourcePostId_topicWatchId: { sourcePostId: source.id, topicWatchId: topic.id } }, create: { workspaceId: workspace.id, projectId: topic.projectId, sourcePostId: source.id, topicWatchId: topic.id, score, reason }, update: { score, reason } });
        outputCount += 1;
        if (anomaly) discovery.logs.push({ timestamp: new Date().toISOString(), level: "info", eventType: "anomaly_assessed", message: reason, term: post.term, payload: { externalId: post.externalId, platform: topic.platform, term: post.term, publicationAgeBucket: candidateBucket, cohortSize: anomaly.cohortSize, anomaly } });
        discovery.logs.push({ timestamp: new Date().toISOString(), level: "info", eventType: "source_post_stored", message: `合格帖子已写入爆帖收件箱：${post.externalId}`, payload: { sourcePostId: source.id, externalId: post.externalId, score } });
      }
    }
    const audit = await tx.pipelineRun.create({ data: { workspaceId: workspace.id, projectId: topic.projectId, kind: "抓取", status, provider: adapterProvider, traceId, inputCount: topic.terms.length, outputCount, note: errorMessage || `${topic.platform} Discovery 完成，读取 ${outputCount} 条帖子；详情见运行日志`, errorCode: errorCode || undefined, errorMessage: errorMessage || undefined, startedAt, completedAt: new Date() } });
    const events = [...discovery.logs];
    if (failedCheck) events.unshift({ timestamp: new Date().toISOString(), level: "error" as const, eventType: "preflight_failed", message: errorMessage, payload: { check: failedCheck.key } });
    if (errorMessage && !failedCheck) events.push({ timestamp: new Date().toISOString(), level: "error" as const, eventType: "run_failed", message: errorMessage });
    events.push({ timestamp: new Date().toISOString(), level: errorCode ? "error" as const : "info" as const, eventType: errorCode ? "run_failed" : "run_completed", message: errorCode ? `运行结束：${errorMessage}` : `运行结束：检查 ${discovery.logs.filter((item) => item.eventType === "candidate_read").length} 个候选，取得 ${outputCount} 条真实帖子`, payload: { outputCount } });
    for (const event of events) {
      await tx.runEvent.create({ data: { workspaceId: workspace.id, projectId: topic.projectId, runId: audit.id, level: event.level, eventType: event.eventType, message: event.message, payload: event.payload ? normalizeJson(event.payload) : undefined, createdAt: new Date(event.timestamp) } });
    }
    return { collection, audit, outputCount };
  });
  json(response, 200, { ok: !errorCode, preflight, run: { id: run.audit.id, collectionRunId: run.collection.id, status: run.audit.status, outputCount: run.outputCount, errorCode: errorCode || undefined, errorMessage: errorMessage || undefined, traceId }, logs: discovery.logs });
}

function normalizeJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null) return Prisma.JsonNull;
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item)) as unknown as Prisma.InputJsonValue;
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeJson(item)])) as unknown as Prisma.InputJsonValue;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

async function parseUpload(request: IncomingMessage, projectId: string, workspace: { id: string }) {
  const contentType = request.headers["content-type"];
  if (!contentType?.toLowerCase().startsWith("multipart/form-data")) throw new ValidationError("Artifact 上传必须使用 multipart/form-data");
  const headers = { "content-type": contentType };
  const parser = Busboy({ headers, limits: { files: 1, fields: 8, fileSize: 512 * 1024 * 1024 } });
  const fields = new Map<string, string>();
  let upload: Promise<{ id: string; kind: string; mimeType: string; originalName?: string; storageKey: string; sizeBytes: number; sha256: string }> | undefined;
  let uploadError: unknown;
  let fileSeen = false;
  parser.on("field", (name, value) => fields.set(name, value));
  parser.on("file", (name, stream, info) => {
    if (name !== "file" || fileSeen) { stream.resume(); return; }
    fileSeen = true;
    if (!allowedMimeTypes.has(info.mimeType)) { stream.resume(); uploadError = new ValidationError(`不支持的 MIME 类型: ${info.mimeType}`); return; }
    try { validateArtifactName(info.mimeType, info.filename); } catch (error) { stream.resume(); uploadError = error; return; }
    const id = randomUUID();
    const kind = fields.get("kind") || (info.mimeType.startsWith("video/") ? "video" : info.mimeType.startsWith("image/") ? "image" : info.mimeType.startsWith("audio/") ? "audio" : "text");
    upload = storage.put({ id, workspaceId: workspace.id, projectId, kind, mimeType: info.mimeType, originalName: info.filename, body: Readable.from(stream) }).then((stored) => ({ ...stored, id, kind, mimeType: info.mimeType, originalName: info.filename }));
    upload = upload.catch((error) => { uploadError = error; return undefined as never; });
  });
  const done = new Promise<void>((resolve, reject) => { parser.once("finish", resolve); parser.once("error", reject); });
  request.pipe(parser);
  await done;
  if (uploadError) throw uploadError;
  if (!upload) throw new ValidationError("请求中没有 file 字段");
  return { fields, artifact: await upload };
}

async function createProject(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace();
  const input = objectInput(await bodyJson(request));
  const name = requiredString(input.name, "name", 200);
  const type = requiredString(input.type, "type", 100);
  const stage = requiredString(input.stage, "stage", 100);
  const targetMarkets = stringArray(input.targetMarkets ?? [], "targetMarkets");
  const languages = stringArray(input.languages ?? [], "languages");
  const platforms = stringArray(input.platforms ?? [], "platforms");
  const timezone = requiredString(input.timezone ?? "UTC", "timezone", 100);
  const description = optionalString(input.description, "description", 2000) ?? "";
  const config = input.config && typeof input.config === "object" ? input.config : input;
  const trackingRules = Array.isArray(input.trackingRules) ? input.trackingRules.map((item) => normalizeTopic(objectInput(item))) : [];
  const result = await db.$transaction(async (tx) => {
    const project = await tx.project.create({ data: { workspaceId: workspace.id, name, type, stage, description, targetMarkets, languages, platforms, timezone, promptPackVersion: optionalString(input.promptPackVersion, "promptPackVersion", 100) } });
    await tx.projectConfigVersion.create({ data: { workspaceId: workspace.id, projectId: project.id, version: 1, config: normalizeJson(config) } });
    for (const topicConfig of trackingRules) { const topic = await tx.topicWatch.create({ data: { workspaceId: workspace.id, projectId: project.id, ...topicConfig } }); await tx.topicWatchVersion.create({ data: { workspaceId: workspace.id, projectId: project.id, topicWatchId: topic.id, version: 1, config: normalizeJson(topicConfig) } }); }
    return project;
  });
  json(response, 201, mapProject(result));
}

async function createTopic(request: IncomingMessage, response: ServerResponse, projectId: string) {
  const { db, workspace } = await currentWorkspace();
  uuidParam(projectId, "projectId");
  const input = objectInput(await bodyJson(request));
  const config = normalizeTopic(input);
  const result = await db.$transaction(async (tx) => {
    const project = await tx.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } });
    if (!project) throw new ValidationError("项目不存在或不属于当前 Workspace");
    const topic = await tx.topicWatch.create({ data: { workspaceId: workspace.id, projectId, ...config } });
    await tx.topicWatchVersion.create({ data: { workspaceId: workspace.id, projectId, topicWatchId: topic.id, version: 1, config: normalizeJson(config) } });
    return topic;
  });
  json(response, 201, result);
}

async function createAccount(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace();
  const input = objectInput(await bodyJson(request));
  const accountInput = input.account && typeof input.account === "object" ? objectInput(input.account) : input;
  const profileInput = input.profile && typeof input.profile === "object" ? objectInput(input.profile) : {};
  const deviceId = optionalString(profileInput.deviceId, "deviceId", 200);
  const appPackage = optionalString(profileInput.appPackage, "appPackage", 200);
  const account = await db.$transaction(async (tx) => {
    const record = await tx.socialAccount.create({ data: { workspaceId: workspace.id, platform: requiredString(accountInput.platform, "platform", 50), label: requiredString(accountInput.label, "label", 200), notes: optionalString(accountInput.notes, "notes", 1000) ?? "", connector: requiredString(profileInput.runnerType ?? "unconfigured", "runnerType", 100) } });
    await tx.accountRunner.create({ data: { workspaceId: workspace.id, accountId: record.id, runnerType: requiredString(profileInput.runnerType ?? "unconfigured", "runnerType", 100), profileName: optionalString(profileInput.profileName, "profileName", 200) ?? record.label, profileRef: optionalString(profileInput.profileRef, "profileRef", 500) ?? (deviceId && appPackage ? `android://${deviceId}/${appPackage}` : `unconfigured://${record.id}`), browserEnvironmentId: optionalString(profileInput.browserEnvironmentId, "browserEnvironmentId", 200), deviceId, deviceModel: optionalString(profileInput.deviceModel, "deviceModel", 200), appPackage } });
    return record;
  });
  json(response, 201, account);
}

async function createBinding(request: IncomingMessage, response: ServerResponse, projectId: string) {
  const { db, workspace } = await currentWorkspace();
  uuidParam(projectId, "projectId");
  const input = objectInput(await bodyJson(request));
  const accountId = uuidParam(typeof input.accountId === "string" ? input.accountId : undefined, "accountId");
  const roles = stringArray(input.roles ?? [], "roles");
  const result = await db.$transaction(async (tx) => {
    const [project, account] = await Promise.all([tx.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } }), tx.socialAccount.findFirst({ where: { id: accountId, workspaceId: workspace.id, lifecycleStatus: "active" } })]);
    if (!project || !account) throw new ValidationError("项目或账号不存在，或账号已归档");
    return tx.projectAccountBinding.create({ data: { workspaceId: workspace.id, projectId, accountId, roles, isPrimaryDiscovery: input.isPrimaryDiscovery === true, isPrimaryPublishing: input.isPrimaryPublishing === true } });
  });
  json(response, 201, result);
}

async function handleArtifactUpload(request: IncomingMessage, response: ServerResponse, projectId: string) {
  const { db, workspace } = await currentWorkspace();
  uuidParam(projectId, "projectId");
  const project = await db.project.findFirst({ where: { id: projectId, workspaceId: workspace.id } });
  if (!project) throw new ValidationError("项目不存在或不属于当前 Workspace");
  const { artifact } = await parseUpload(request, projectId, workspace);
  try {
    const record = await db.artifact.create({ data: { id: artifact.id, workspaceId: workspace.id, projectId, kind: artifact.kind, storageProvider: "local", storageKey: artifact.storageKey, originalName: artifact.originalName, mimeType: artifact.mimeType, sizeBytes: BigInt(artifact.sizeBytes), sha256: artifact.sha256, status: "ready" } });
    json(response, 201, { id: record.id, kind: record.kind, mimeType: record.mimeType, sizeBytes: record.sizeBytes, sha256: record.sha256, storageProvider: record.storageProvider, storageKey: record.storageKey });
  } catch (error) {
    await storage.delete(artifact.id).catch(() => undefined);
    throw error;
  }
}

async function listSourcePosts(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace();
  const projectId = new URL(request.url ?? "", "http://127.0.0.1").searchParams.get("projectId");
  const posts = await db.sourcePost.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) }, orderBy: { capturedAt: "desc" } });
  const metrics = await db.sourceMetricSnapshot.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) }, orderBy: { capturedAt: "desc" } });
  const matches = await db.sourcePostMatch.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) }, orderBy: { createdAt: "desc" } });
  const latest = new Map<string, typeof metrics[number]>(); for (const metric of metrics) if (!latest.has(metric.sourcePostId)) latest.set(metric.sourcePostId, metric);
  const latestMatch = new Map<string, typeof matches[number]>(); for (const match of matches) if (!latestMatch.has(match.sourcePostId)) latestMatch.set(match.sourcePostId, match);
  json(response, 200, posts.map((post) => {
    const metric = latest.get(post.id);
    const match = latestMatch.get(post.id);
    const raw = metric?.rawPayload && typeof metric.rawPayload === "object" && !Array.isArray(metric.rawPayload) ? metric.rawPayload as Record<string, unknown> : {};
    const anomaly = raw.anomaly && typeof raw.anomaly === "object" && !Array.isArray(raw.anomaly) ? raw.anomaly as Record<string, unknown> : undefined;
    const sourceRaw = post.rawPayload && typeof post.rawPayload === "object" && !Array.isArray(post.rawPayload) ? post.rawPayload as Record<string, unknown> : {};
    const signals = [
      post.publishedAt ? `发布时间已确认：${post.publishedAt.toISOString()}` : "发布时间待确认",
      `硬阈值结果：${match?.reason ?? "未匹配话题规则"}`,
      anomaly?.state === "insufficient_baseline" ? `相对异常基线不足：${Number(anomaly.cohortSize ?? 0)} 条` : anomaly?.state === "positive_outlier" ? "相对异常：正向爆发" : anomaly?.state === "normal" ? "相对异常：正常波动" : "相对异常：未启用",
    ];
    const likes = metric?.likes ?? 0;
    const comments = metric?.comments ?? 0;
    return { ...post, likes, comments, score: metric?.score ?? 0, reason: match?.reason ?? "未匹配话题规则", topic: typeof raw.term === "string" ? raw.term : "", capturedBy: typeof sourceRaw.source === "string" ? sourceRaw.source : "control-api", evidence: { signals, scoreBreakdown: [{ label: "点赞", value: likes.toLocaleString("zh-CN") }, { label: "评论", value: comments.toLocaleString("zh-CN") }, { label: "评论率", value: likes > 0 ? `${(comments / likes * 100).toFixed(2)}%` : "—" }], capturedBy: typeof sourceRaw.source === "string" ? sourceRaw.source : "control-api", capturedAt: metric?.capturedAt ?? post.capturedAt } };
  }));
}

async function reviewSourcePosts(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace(); const input = objectInput(await bodyJson(request)); const ids = stringArray(input.ids ?? [], "ids"); const status = input.status === "approved" ? "approved" : input.status === "rejected" ? "rejected" : "pending";
  const result = await db.$transaction(async (tx) => { const posts = await tx.sourcePost.findMany({ where: { id: { in: ids }, workspaceId: workspace.id } }); if (posts.length !== ids.length) throw new ValidationError("部分帖子不存在或不属于当前 Workspace"); for (const post of posts) { await tx.sourcePost.update({ where: { id: post.id }, data: { reviewState: status, action: status === "approved" ? "adapt" : status === "rejected" ? "ignored" : "unreviewed" } }); await tx.sourceReview.create({ data: { workspaceId: workspace.id, projectId: post.projectId, sourcePostId: post.id, status, action: status === "approved" ? "adapt" : status === "rejected" ? "ignored" : "unreviewed", reason: optionalString(input.reason, "reason", 1000), reviewer: "dashboard" } }); }
    return posts.length;
  }); json(response, 200, { updated: result });
}

function ideaPayload(idea: Record<string, unknown>, revision?: Record<string, unknown>, sources: string[] = [], targets: string[] = []) { return { ...idea, hook: revision?.hook || "", copy: revision?.copy || "", videoPrompt: revision?.videoSpec && typeof revision.videoSpec === "object" ? (revision.videoSpec as Record<string, unknown>).prompt : undefined, source: sources[0] || "", sourcePostIds: sources, platforms: targets, updatedAt: idea.updatedAt }; }

async function listIdeas(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace(); const projectId = new URL(request.url ?? "", "http://127.0.0.1").searchParams.get("projectId"); const ideas = await db.idea.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) }, orderBy: { updatedAt: "desc" } }); const revisions = await db.ideaRevision.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) }, orderBy: { version: "desc" } }); const sources = await db.ideaSource.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) } }); const targets = await db.ideaPlatformTarget.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) } }); return json(response, 200, ideas.map((idea) => ideaPayload(idea, revisions.find((revision) => revision.ideaId === idea.id), sources.filter((source) => source.ideaId === idea.id).map((source) => source.sourcePostId).filter((id): id is string => Boolean(id)), targets.filter((target) => target.ideaId === idea.id).map((target) => target.platform))));
}

async function createIdeas(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace(); const input = objectInput(await bodyJson(request)); const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId"); const sourceIds = stringArray(input.sourcePostIds ?? [], "sourcePostIds"); const approved = await db.sourcePost.findMany({ where: { workspaceId: workspace.id, projectId, id: { in: sourceIds }, reviewState: "approved" } }); if (approved.length !== sourceIds.length) throw new ValidationError("Idea 只能使用已人工通过的 SourcePost"); const count = numberInput(input.count, "count", 1, 1, 50); const titles = Array.isArray(input.ideas) ? input.ideas.map((item) => objectInput(item)) : [{ title: requiredString(input.title ?? "未命名 Idea", "title", 300), hook: optionalString(input.hook, "hook", 2000) ?? "", copy: optionalString(input.copy, "copy", 5000) ?? "", format: optionalString(input.format, "format", 50) ?? "纯文本" }]; const created = await db.$transaction(async (tx) => { const output = []; for (let index = 0; index < Math.max(count, titles.length); index += 1) { const item = titles[index % titles.length]; const idea = await tx.idea.create({ data: { workspaceId: workspace.id, projectId, title: requiredString(item.title ?? `Idea ${index + 1}`, "title", 300), format: requiredString(item.format ?? "纯文本", "format", 50), generationBatchId: randomUUID() } }); const revision = await tx.ideaRevision.create({ data: { workspaceId: workspace.id, projectId, ideaId: idea.id, version: 1, hook: optionalString(item.hook, "hook", 2000) ?? "", copy: optionalString(item.copy, "copy", 5000) ?? "", videoSpec: item.videoPrompt ? { prompt: requiredString(item.videoPrompt, "videoPrompt", 10000) } : undefined, createdBy: "dashboard" } }); for (const sourcePostId of sourceIds) await tx.ideaSource.create({ data: { workspaceId: workspace.id, projectId, ideaId: idea.id, sourcePostId } }); const platforms = stringArray(input.platforms ?? [], "platforms"); for (const platform of platforms) await tx.ideaPlatformTarget.create({ data: { workspaceId: workspace.id, projectId, ideaId: idea.id, platform } }); output.push(ideaPayload(idea, revision, sourceIds, platforms)); } return output; }); json(response, 201, created);
}

async function patchIdea(request: IncomingMessage, response: ServerResponse, id: string) {
  const { db, workspace } = await currentWorkspace(); uuidParam(id, "ideaId"); const input = objectInput(await bodyJson(request)); const current = await db.idea.findFirstOrThrow({ where: { id, workspaceId: workspace.id } }); const version = current.currentVersion + 1; const revision = await db.$transaction(async (tx) => { const idea = await tx.idea.update({ where: { id }, data: { title: input.title === undefined ? undefined : requiredString(input.title, "title", 300), format: input.format === undefined ? undefined : requiredString(input.format, "format", 50), currentVersion: version } }); const next = await tx.ideaRevision.create({ data: { workspaceId: workspace.id, projectId: current.projectId, ideaId: id, version, hook: optionalString(input.hook, "hook", 2000) ?? "", copy: optionalString(input.copy, "copy", 5000) ?? "", videoSpec: input.videoPrompt ? { prompt: requiredString(input.videoPrompt, "videoPrompt", 10000) } : undefined, assetDecision: optionalString(input.assetMatch, "assetMatch", 100), createdBy: "dashboard" } }); return { idea, revision: next }; }); json(response, 200, ideaPayload(revision.idea, revision.revision));
}

async function reviewIdeas(request: IncomingMessage, response: ServerResponse) { const { db, workspace } = await currentWorkspace(); const input = objectInput(await bodyJson(request)); const ids = stringArray(input.ids ?? [], "ids"); const status = input.status === "approved" ? "approved" : input.status === "rejected" ? "rejected" : "candidate"; const updated = await db.$transaction(async (tx) => { const ideas = await tx.idea.findMany({ where: { id: { in: ids }, workspaceId: workspace.id } }); if (ideas.length !== ids.length) throw new ValidationError("部分 Idea 不存在或不属于当前 Workspace"); for (const idea of ideas) { await tx.idea.update({ where: { id: idea.id }, data: { status } }); await tx.reviewDecision.create({ data: { workspaceId: workspace.id, projectId: idea.projectId, entityType: "idea", entityId: idea.id, status: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending", reason: optionalString(input.reason, "reason", 1000), reviewer: "dashboard", objectVersion: idea.currentVersion } }); } return ids.length; }); json(response, 200, { updated }); }

async function createGenerationRun(request: IncomingMessage, response: ServerResponse) { const { db, workspace } = await currentWorkspace(); const input = objectInput(await bodyJson(request)); const key = idempotencyKey(request, input); if (key) { const existing = await db.idempotencyKey.findUnique({ where: { workspaceId_key_operation: { workspaceId: workspace.id, key, operation: "generation-run.create" } } }); if (existing?.response) { json(response, 200, existing.response); return; } } const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId"); const provider = optionalString(input.provider, "provider", 200) ?? "unconfigured"; const traceId = optionalString(input.traceId, "traceId", 200) ?? randomUUID(); const run = await db.$transaction(async (tx) => { const created = await tx.generationRun.create({ data: { workspaceId: workspace.id, projectId, ideaId: typeof input.ideaId === "string" ? input.ideaId : undefined, provider, providerVersion: optionalString(input.providerVersion, "providerVersion", 200), promptVersion: optionalString(input.promptVersion, "promptVersion", 200), traceId, idempotencyKey: key, inputSnapshot: normalizeJson(input), status: "queued", errorCode: provider === "unconfigured" ? "PROVIDER_NOT_CONFIGURED" : undefined, errorMessage: provider === "unconfigured" ? "生成 Provider 尚未配置，任务未执行" : undefined } }); if (key) await tx.idempotencyKey.create({ data: { workspaceId: workspace.id, key, operation: "generation-run.create", requestHash: randomUUID(), response: jsonSnapshot(created) } }); return created; }); json(response, 201, run); }

async function createPublicationDraft(request: IncomingMessage, response: ServerResponse) { const { db, workspace } = await currentWorkspace(); const input = objectInput(await bodyJson(request)); const key = idempotencyKey(request, input); if (key) { const existing = await db.idempotencyKey.findUnique({ where: { workspaceId_key_operation: { workspaceId: workspace.id, key, operation: "publication-draft.create" } } }); if (existing?.response) { json(response, 200, existing.response); return; } } const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId"); const draft = await db.$transaction(async (tx) => { const created = await tx.publicationDraft.create({ data: { workspaceId: workspace.id, projectId, renditionId: typeof input.renditionId === "string" ? input.renditionId : undefined, accountId: typeof input.accountId === "string" ? input.accountId : undefined, platform: requiredString(input.platform, "platform", 50), idempotencyKey: key } }); if (key) await tx.idempotencyKey.create({ data: { workspaceId: workspace.id, key, operation: "publication-draft.create", requestHash: randomUUID(), response: jsonSnapshot(created) } }); return created; }); json(response, 201, draft); }

async function migrateDemoWorkspace(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace(); const input = objectInput(await bodyJson(request)); const key = idempotencyKey(request, input); if (key) { const existing = await db.idempotencyKey.findUnique({ where: { workspaceId_key_operation: { workspaceId: workspace.id, key, operation: "demo-workspace.migrate" } } }); if (existing?.response) { json(response, 200, existing.response); return; } } const projects = Array.isArray(input.projects) ? input.projects.map(objectInput) : []; const topics = Array.isArray(input.topicWatches) ? input.topicWatches.map(objectInput) : []; const accounts = Array.isArray(input.accounts) ? input.accounts.map(objectInput) : []; const bindings = Array.isArray(input.accountBindings) ? input.accountBindings.map(objectInput) : []; const projectIds = new Map<string, string>(); const accountIds = new Map<string, string>();
  await db.$transaction(async (tx) => { for (const legacy of projects) { const id = randomUUID(); projectIds.set(String(legacy.id), id); await tx.project.create({ data: { id, workspaceId: workspace.id, name: requiredString(legacy.name, "project.name", 200), type: requiredString(legacy.type ?? "other", "project.type", 100), stage: requiredString(legacy.stage ?? "Research", "project.stage", 100), description: optionalString(legacy.description, "project.description", 2000) ?? "", targetMarkets: stringArray(legacy.targetMarkets ?? [], "project.targetMarkets"), languages: stringArray(legacy.languages ?? [], "project.languages"), platforms: stringArray(legacy.platforms ?? [], "project.platforms"), timezone: requiredString(legacy.timezone ?? "UTC", "project.timezone", 100), status: legacy.status === "archived" ? "archived" : "active", promptPackVersion: optionalString(legacy.promptPackVersion, "project.promptPackVersion", 100) } }); await tx.projectConfigVersion.create({ data: { workspaceId: workspace.id, projectId: id, version: 1, config: normalizeJson(legacy.config ?? legacy) } }); }
    for (const legacy of topics) { const projectId = projectIds.get(String(legacy.projectId)); if (!projectId) continue; const config = normalizeTopic(legacy); const topic = await tx.topicWatch.create({ data: { id: randomUUID(), workspaceId: workspace.id, projectId, ...config } }); await tx.topicWatchVersion.create({ data: { workspaceId: workspace.id, projectId, topicWatchId: topic.id, version: 1, config: normalizeJson(config) } }); }
    for (const legacy of accounts) { const id = randomUUID(); accountIds.set(String(legacy.id), id); const account = await tx.socialAccount.create({ data: { id, workspaceId: workspace.id, platform: requiredString(legacy.platform ?? "TikTok", "account.platform", 50), label: requiredString(legacy.label ?? "Migrated account", "account.label", 200), handle: optionalString(legacy.handle, "account.handle", 100) ?? "", externalUserId: optionalString(legacy.externalUserId, "account.externalUserId", 200), displayName: optionalString(legacy.displayName, "account.displayName", 200), avatarUrl: optionalString(legacy.avatarUrl, "account.avatarUrl", 1000), profileUrl: optionalString(legacy.profileUrl, "account.profileUrl", 1000), identityConfirmedAt: typeof legacy.identityConfirmedAt === "string" ? new Date(legacy.identityConfirmedAt) : undefined, lifecycleStatus: legacy.lifecycleStatus === "archived" ? "archived" : "active", sharingPolicy: optionalString(legacy.sharingPolicy, "account.sharingPolicy", 50) ?? "shared_workspace", connector: optionalString(legacy.connector, "account.connector", 100) ?? "unconfigured", notes: optionalString(legacy.notes, "account.notes", 1000) ?? "" } }); await tx.accountRunner.create({ data: { workspaceId: workspace.id, accountId: account.id, runnerType: "unconfigured", profileName: account.label, profileRef: `migrated://${account.id}` } }); }
    for (const legacy of bindings) { const projectId = projectIds.get(String(legacy.projectId)); const accountId = accountIds.get(String(legacy.accountId)); if (projectId && accountId) await tx.projectAccountBinding.create({ data: { id: randomUUID(), workspaceId: workspace.id, projectId, accountId, roles: stringArray(legacy.roles ?? [], "binding.roles"), isPrimaryDiscovery: legacy.isPrimaryDiscovery === true, isPrimaryPublishing: legacy.isPrimaryPublishing === true } }); }
  }); const result = { migrated: true, projects: projectIds.size, accounts: accountIds.size }; if (key) await db.idempotencyKey.create({ data: { workspaceId: workspace.id, key, operation: "demo-workspace.migrate", requestHash: randomUUID(), response: result } }); json(response, 200, result);
}

async function handle(request: IncomingMessage, response: ServerResponse, pathname: string) {
  if (pathname === `${BASE}/health` && request.method === "GET") {
    try { json(response, 200, { status: "ready", database: await checkDatabase(), storage: { provider: "local", root: storage.root } }); }
    catch (error) { errorResponse(response, error); }
    return;
  }
  try {
    if (pathname === `${BASE}/platforms` && request.method === "GET") { json(response, 200, listPlatformAdapters()); return; }
    if (pathname === `${BASE}/providers/autoglm` && request.method === "GET") { json(response, 200, autoGlmProviderStatus()); return; }
    if (pathname === `${BASE}/providers/autoglm/test` && request.method === "POST") { json(response, 200, await testAutoGlmProvider()); return; }
    if (pathname === `${BASE}/workspace` && request.method === "GET") {
      const { db, workspace } = await currentWorkspace();
      json(response, 200, await workspaceSnapshot(db, workspace.id));
      return;
    }
    if (pathname === `${BASE}/migrations/demo-workspace` && request.method === "POST") { await migrateDemoWorkspace(request, response); return; }
    const projects = pathname.match(new RegExp(`^${BASE}/projects(?:/([^/]+))?(?:/(archive|restore|config-versions))?$`));
    if (projects) {
      const id = projects[1];
      const suffix = projects[2];
      if (request.method === "GET" && !id) { const { db, workspace } = await currentWorkspace(); json(response, 200, (await db.project.findMany({ where: { workspaceId: workspace.id, status: "active" }, orderBy: { createdAt: "desc" } })).map(mapProject)); return; }
      if (request.method === "POST" && !id) { await createProject(request, response); return; }
      if (!id) throw new ValidationError("项目 ID 缺失");
      uuidParam(id, "projectId");
      const { db, workspace } = await currentWorkspace();
      await requireProject(db, workspace.id, id);
      if (request.method === "GET" && !suffix) { json(response, 200, await db.project.findFirstOrThrow({ where: { id, workspaceId: workspace.id } })); return; }
      if (request.method === "POST" && suffix === "archive") { json(response, 200, await db.project.update({ where: { id }, data: { status: "archived" } })); return; }
      if (request.method === "POST" && suffix === "restore") { json(response, 200, await db.project.update({ where: { id }, data: { status: "active" } })); return; }
      if (request.method === "PATCH" && !suffix) { const input = objectInput(await bodyJson(request)); json(response, 200, mapProject(await db.project.update({ where: { id }, data: { name: input.name === undefined ? undefined : requiredString(input.name, "name", 200), type: input.type === undefined ? undefined : requiredString(input.type, "type", 100), stage: input.stage === undefined ? undefined : requiredString(input.stage, "stage", 100), description: input.description === undefined ? undefined : requiredString(input.description, "description", 2000), targetMarkets: input.targetMarkets === undefined ? undefined : stringArray(input.targetMarkets, "targetMarkets"), languages: input.languages === undefined ? undefined : stringArray(input.languages, "languages"), platforms: input.platforms === undefined ? undefined : stringArray(input.platforms, "platforms"), timezone: input.timezone === undefined ? undefined : requiredString(input.timezone, "timezone", 100), promptPackVersion: input.promptPackVersion === undefined ? undefined : optionalString(input.promptPackVersion, "promptPackVersion", 100) } }))); return; }
      if (request.method === "POST" && suffix === "config-versions") { const input = objectInput(await bodyJson(request)); const version = ((await db.projectConfigVersion.aggregate({ where: { projectId: id }, _max: { version: true } }))._max.version ?? 0) + 1; json(response, 201, await db.projectConfigVersion.create({ data: { workspaceId: workspace.id, projectId: id, version, config: input.config ?? input } })); return; }
    }
    const topics = pathname.match(new RegExp(`^${BASE}/topic-watches(?:/([^/]+))?(?:/(versions|preflight|runs))?$`));
    if (topics) {
      const id = topics[1];
      if (request.method === "GET" && !id) { const { db, workspace } = await currentWorkspace(); json(response, 200, await db.topicWatch.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" } })); return; }
      if (request.method === "POST" && !id) throw new ValidationError("请使用 /projects/:projectId/topic-watches 创建规则");
      if (!id) throw new ValidationError("Topic Watch ID 缺失");
      uuidParam(id, "topicWatchId"); const { db, workspace } = await currentWorkspace();
      if (request.method === "POST" && topics[2] === "preflight") { json(response, 200, await topicPreflight(id)); return; }
      if (request.method === "POST" && topics[2] === "runs") { await runTopicWatch(request, response, id); return; }
      if (request.method === "PATCH" && !topics[2]) { const input = objectInput(await bodyJson(request)); const current = await db.topicWatch.findFirstOrThrow({ where: { id, workspaceId: workspace.id } }); const version = current.currentVersion + 1; const config = { ...input }; const bindingId = input.collectorAccountBindingId === undefined ? current.collectorAccountBindingId : typeof input.collectorAccountBindingId === "string" && input.collectorAccountBindingId.trim() ? uuidParam(input.collectorAccountBindingId, "collectorAccountBindingId") : null; const updated = await db.$transaction(async (tx) => { const topic = await tx.topicWatch.update({ where: { id }, data: { name: input.name === undefined ? current.name : requiredString(input.name, "name"), state: input.state === "paused" ? "paused" : input.state === "running" ? "running" : current.state, terms: input.terms === undefined ? current.terms : stringArray(input.terms, "terms"), excludeTerms: input.excludeTerms === undefined ? current.excludeTerms : stringArray(input.excludeTerms, "excludeTerms"), searchMode: input.searchMode === undefined ? current.searchMode : "sequential", minLikes: numberInput(input.minLikes, "minLikes", current.minLikes), minComments: numberInput(input.minComments, "minComments", current.minComments), maxAgeHours: numberInput(input.maxAgeHours, "maxAgeHours", current.maxAgeHours, 1), minScore: numberInput(input.minScore, "minScore", current.minScore, 0, 100), anomalyEnabled: input.anomalyEnabled === undefined ? current.anomalyEnabled : input.anomalyEnabled !== false, anomalyMethod: input.anomalyMethod === undefined ? current.anomalyMethod : "robust_mad", anomalyBaselineDays: numberInput(input.anomalyBaselineDays, "anomalyBaselineDays", current.anomalyBaselineDays, 7, 365), anomalyMinSamples: numberInput(input.anomalyMinSamples, "anomalyMinSamples", current.anomalyMinSamples, 10, 10_000), anomalyZThreshold: numberInput(input.anomalyZThreshold, "anomalyZThreshold", current.anomalyZThreshold, 1, 10), collectorAccountBindingId: bindingId, cadence: input.cadence === undefined ? current.cadence : requiredString(input.cadence, "cadence"), currentVersion: version }, }); await tx.topicWatchVersion.create({ data: { workspaceId: workspace.id, projectId: current.projectId, topicWatchId: id, version, config: config as Prisma.InputJsonValue } }); return topic; }); json(response, 200, updated); return; }
      if (request.method === "POST" && topics[2] === "versions") { const input = objectInput(await bodyJson(request)); const current = await db.topicWatch.findFirstOrThrow({ where: { id, workspaceId: workspace.id } }); const version = current.currentVersion + 1; json(response, 201, await db.$transaction(async (tx) => { const topic = await tx.topicWatch.update({ where: { id }, data: { currentVersion: version } }); await tx.topicWatchVersion.create({ data: { workspaceId: workspace.id, projectId: current.projectId, topicWatchId: id, version, config: (input.config ?? input) as Prisma.InputJsonValue } }); return topic; })); return; }
    }
    const projectTopic = pathname.match(new RegExp(`^${BASE}/projects/([^/]+)/topic-watches$`));
    if (projectTopic && request.method === "POST") { await createTopic(request, response, projectTopic[1]); return; }
    const accounts = pathname.match(new RegExp(`^${BASE}/accounts(?:/([^/]+))?(?:/(archive|restore|identity-checks))?$`));
    if (accounts) { const id = accounts[1]; const suffix = accounts[2]; const { db, workspace } = await currentWorkspace(); if (request.method === "GET" && !id) { json(response, 200, await db.socialAccount.findMany({ where: { workspaceId: workspace.id, lifecycleStatus: "active" }, orderBy: { createdAt: "desc" } })); return; } if (request.method === "POST" && !id) { await createAccount(request, response); return; } if (!id) throw new ValidationError("账号 ID 缺失"); uuidParam(id, "accountId"); if (request.method === "GET" && suffix === "identity-checks") { json(response, 200, await db.accountIdentityCheck.findMany({ where: { workspaceId: workspace.id, accountId: id }, orderBy: { detectedAt: "desc" } })); return; } if (request.method === "POST" && suffix === "identity-checks") { const input = objectInput(await bodyJson(request)); const detectedAt = new Date(typeof input.detectedAt === "string" ? input.detectedAt : Date.now()); const status = requiredString(input.status ?? "detected", "status", 50); const handle = requiredString(input.handle, "handle", 100); const check = await db.$transaction(async (tx) => { await tx.socialAccount.findFirstOrThrow({ where: { id, workspaceId: workspace.id } }); const checkRecord = await tx.accountIdentityCheck.create({ data: { workspaceId: workspace.id, accountId: id, externalUserId: optionalString(input.externalUserId, "externalUserId", 200), handle, displayName: requiredString(input.displayName, "displayName", 200), avatarUrl: optionalString(input.avatarUrl, "avatarUrl", 1000), profileUrl: requiredString(input.profileUrl, "profileUrl", 1000), status, detectedAt, rawPayload: input.rawPayload as Prisma.InputJsonValue | undefined } }); if (status === "identity_mismatch") { await tx.accountRunner.updateMany({ where: { accountId: id, workspaceId: workspace.id }, data: { sessionStatus: "identity_mismatch", lastVerifiedAt: detectedAt, lastHealthCheck: `身份冲突：检测到 ${handle}` } }); } else { await tx.socialAccount.update({ where: { id }, data: { externalUserId: optionalString(input.externalUserId, "externalUserId", 200), handle, displayName: requiredString(input.displayName, "displayName", 200), avatarUrl: optionalString(input.avatarUrl, "avatarUrl", 1000), profileUrl: requiredString(input.profileUrl, "profileUrl", 1000), identityConfirmedAt: detectedAt } }); await tx.accountRunner.updateMany({ where: { accountId: id, workspaceId: workspace.id }, data: { sessionStatus: "healthy", lastVerifiedAt: detectedAt, lastHealthCheck: `已确认 ${handle}` } }); } return checkRecord; }); json(response, 201, check); return; } if (request.method === "POST" && suffix === "archive") { json(response, 200, await db.socialAccount.update({ where: { id }, data: { lifecycleStatus: "archived" } })); return; } if (request.method === "POST" && suffix === "restore") { json(response, 200, await db.socialAccount.update({ where: { id }, data: { lifecycleStatus: "active" } })); return; } if (request.method === "PATCH" && !suffix) { const input = objectInput(await bodyJson(request)); const accountInput = input.account && typeof input.account === "object" ? objectInput(input.account) : input; const profileInput = input.profile && typeof input.profile === "object" ? objectInput(input.profile) : undefined; const updated = await db.$transaction(async (tx) => { const owned = await tx.socialAccount.findFirstOrThrow({ where: { id, workspaceId: workspace.id } }); const account = await tx.socialAccount.update({ where: { id: owned.id }, data: { label: accountInput.label === undefined ? undefined : requiredString(accountInput.label, "label"), notes: accountInput.notes === undefined ? undefined : optionalString(accountInput.notes, "notes", 1000) ?? "", connector: profileInput?.runnerType === undefined ? undefined : requiredString(profileInput.runnerType, "runnerType", 100) } }); if (profileInput) { const deviceId = profileInput.deviceId === undefined ? undefined : optionalString(profileInput.deviceId, "deviceId", 200) ?? null; const appPackage = profileInput.appPackage === undefined ? undefined : optionalString(profileInput.appPackage, "appPackage", 200) ?? null; const currentRunner = await tx.accountRunner.findFirstOrThrow({ where: { accountId: id, workspaceId: workspace.id } }); const nextDeviceId = deviceId === undefined ? currentRunner.deviceId : deviceId; const nextAppPackage = appPackage === undefined ? currentRunner.appPackage : appPackage; const profileRefChanged = profileInput.deviceId !== undefined || profileInput.appPackage !== undefined; await tx.accountRunner.update({ where: { id: currentRunner.id }, data: { runnerType: profileInput.runnerType === undefined ? undefined : requiredString(profileInput.runnerType, "runnerType", 100), profileName: profileInput.profileName === undefined ? undefined : requiredString(profileInput.profileName, "profileName", 200), profileRef: profileRefChanged ? (nextDeviceId && nextAppPackage ? `android://${nextDeviceId}/${nextAppPackage}` : `unconfigured://${id}`) : undefined, browserEnvironmentId: profileInput.browserEnvironmentId === undefined ? undefined : optionalString(profileInput.browserEnvironmentId, "browserEnvironmentId", 200) ?? null, deviceId, deviceModel: profileInput.deviceModel === undefined ? undefined : optionalString(profileInput.deviceModel, "deviceModel", 200) ?? null, appPackage } }); } return account; }); json(response, 200, updated); return; } }
    const bindings = pathname.match(new RegExp(`^${BASE}/projects/([^/]+)/account-bindings(?:/([^/]+))?$`));
    if (bindings) { const projectId = uuidParam(bindings[1], "projectId"); const bindingId = bindings[2]; const { db, workspace } = await currentWorkspace(); if (request.method === "GET" && !bindingId) { json(response, 200, await db.projectAccountBinding.findMany({ where: { workspaceId: workspace.id, projectId } })); return; } if (request.method === "POST" && !bindingId) { await createBinding(request, response, projectId); return; } if (request.method === "DELETE" && bindingId) { uuidParam(bindingId, "bindingId"); json(response, 200, await db.projectAccountBinding.delete({ where: { id: bindingId } })); return; } }
    const artifactProject = pathname.match(new RegExp(`^${BASE}/projects/([^/]+)/artifacts$`));
    if (artifactProject && request.method === "POST") { await handleArtifactUpload(request, response, artifactProject[1]); return; }
    const artifact = pathname.match(new RegExp(`^${BASE}/artifacts/([^/]+)(/content)?$`));
    if (artifact) { const id = uuidParam(artifact[1], "artifactId"); const { db, workspace } = await currentWorkspace(); const record = await db.artifact.findFirstOrThrow({ where: { id, workspaceId: workspace.id, status: "ready" } }); if (artifact[2] && request.method === "GET") { response.statusCode = 200; response.setHeader("Content-Type", record.mimeType); response.setHeader("Content-Length", record.sizeBytes.toString()); response.setHeader("Content-Disposition", `inline; filename="${(record.originalName || `${record.id}.bin`).replace(/[^a-zA-Z0-9._-]/g, "_")}"`); (await storage.get(record.id)).pipe(response); return; } if (request.method === "GET") { json(response, 200, record); return; } if (request.method === "DELETE") { await db.artifact.update({ where: { id }, data: { status: "deleted" } }); await storage.delete(record.id); json(response, 204, {}); return; } }
    const sourcePosts = pathname === `${BASE}/source-posts`;
    if (sourcePosts && request.method === "GET") { await listSourcePosts(request, response); return; }
    if (pathname === `${BASE}/source-posts/reviews` && request.method === "POST") { await reviewSourcePosts(request, response); return; }
    const ideas = pathname.match(new RegExp(`^${BASE}/ideas(?:/([^/]+))?$`));
    if (ideas && request.method === "GET" && !ideas[1]) { await listIdeas(request, response); return; }
    if (ideas && request.method === "POST" && !ideas[1]) { await createIdeas(request, response); return; }
    if (ideas && request.method === "PATCH" && ideas[1]) { await patchIdea(request, response, ideas[1]); return; }
    if (pathname === `${BASE}/ideas/reviews` && request.method === "POST") { await reviewIdeas(request, response); return; }
    const generation = pathname.match(new RegExp(`^${BASE}/generation-runs(?:/([^/]+))?$`));
    if (generation && request.method === "POST" && !generation[1]) { await createGenerationRun(request, response); return; }
    if (generation && request.method === "GET") { const { db, workspace } = await currentWorkspace(); const projectId = new URL(request.url ?? "", "http://127.0.0.1").searchParams.get("projectId"); const run = generation[1] ? await db.generationRun.findFirstOrThrow({ where: { id: generation[1], workspaceId: workspace.id } }) : await db.generationRun.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) }, orderBy: { createdAt: "desc" } }); json(response, 200, run); return; }
    if (generation && request.method === "PATCH" && generation[1]) { const { db, workspace } = await currentWorkspace(); const input = objectInput(await bodyJson(request)); const current = await db.generationRun.findFirstOrThrow({ where: { id: generation[1], workspaceId: workspace.id } }); json(response, 200, await db.generationRun.update({ where: { id: current.id }, data: { inputSnapshot: normalizeJson(input), promptVersion: optionalString(input.promptVersion, "promptVersion", 200), errorCode: undefined, errorMessage: undefined } })); return; }
    const publication = pathname.match(new RegExp(`^${BASE}/publication-drafts(?:/([^/]+))?(?:/(approve|execute))?$`));
    if (publication && request.method === "POST" && !publication[1]) { await createPublicationDraft(request, response); return; }
    if (publication && request.method === "POST" && publication[1] && publication[2] === "approve") { const { db, workspace } = await currentWorkspace(); const draft = await db.publicationDraft.updateMany({ where: { id: publication[1], workspaceId: workspace.id, status: "draft" }, data: { status: "approved" } }); if (!draft.count) throw new ValidationError("草稿不存在或当前状态不可审批"); json(response, 200, await db.publicationDraft.findUniqueOrThrow({ where: { id: publication[1] } })); return; }
    if (publication && request.method === "POST" && publication[1] && publication[2] === "execute") { const { db, workspace } = await currentWorkspace(); const draft = await db.publicationDraft.updateMany({ where: { id: publication[1], workspaceId: workspace.id, status: "approved" }, data: { status: "failed_retryable", errorCode: "PUBLISHER_NOT_CONFIGURED", errorMessage: "Publisher 尚未配置，发布未执行" } }); if (!draft.count) throw new ValidationError("草稿不存在或必须先审批"); json(response, 200, await db.publicationDraft.findUniqueOrThrow({ where: { id: publication[1] } })); return; }
    if (pathname === `${BASE}/publication-drafts` && request.method === "GET") { const { db, workspace } = await currentWorkspace(); json(response, 200, await db.publicationDraft.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" } })); return; }
    const assets = pathname === `${BASE}/assets`;
    if (assets && request.method === "GET") { const { db, workspace } = await currentWorkspace(); const projectId = new URL(request.url ?? "", "http://127.0.0.1").searchParams.get("projectId"); json(response, 200, await db.asset.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) }, orderBy: { createdAt: "desc" } })); return; }
    if (assets && request.method === "POST") { const { db, workspace } = await currentWorkspace(); const input = objectInput(await bodyJson(request)); const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId"); const asset = await db.$transaction(async (tx) => { const record = await tx.asset.create({ data: { workspaceId: workspace.id, projectId, name: requiredString(input.name, "name", 300), type: requiredString(input.type, "type", 50), usage: optionalString(input.usage, "usage", 1000) ?? "", status: "available" } }); await tx.assetVersion.create({ data: { workspaceId: workspace.id, projectId, assetId: record.id, version: 1, tags: stringArray(input.tags ?? [], "tags"), metadata: input.metadata as Prisma.InputJsonValue | undefined } }); return record; }); json(response, 201, asset); return; }
    const runs = pathname.match(new RegExp(`^${BASE}/(?:runs|generation-runs)(?:/([^/]+))?$`));
    if (runs && request.method === "GET") {
      const { db, workspace } = await currentWorkspace();
      if (runs[1]) {
        const run = await db.pipelineRun.findFirstOrThrow({ where: { id: runs[1], workspaceId: workspace.id } });
        const events = await db.runEvent.findMany({ where: { runId: run.id, workspaceId: workspace.id }, orderBy: { createdAt: "asc" } });
        json(response, 200, { ...run, events });
      } else {
        json(response, 200, await db.pipelineRun.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" } }));
      }
      return;
    }
    const audit = pathname === `${BASE}/audit-logs`;
    if (audit && request.method === "GET") { const { db, workspace } = await currentWorkspace(); json(response, 200, await db.auditLog.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 200 })); return; }
    json(response, 404, { error: { code: "NOT_FOUND", message: "Control API 路由不存在" } });
  } catch (error) { errorResponse(response, error); }
}

export function controlApiPlugin(): Plugin {
  return { name: "marketing-pipeline-control-api", configureServer(server) { server.middlewares.use((request, response, next) => { const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname; if (!pathname.startsWith(BASE)) { next(); return; } void handle(request, response, pathname); }); } };
}
