import Busboy from "busboy";
import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { Plugin } from "vite";
import { Prisma } from "@prisma/client";
import type { PrismaClient, TopicWatch } from "@prisma/client";
import { checkDatabase, DatabaseUnavailableError, getPrismaClient } from "./db/client.js";
import { ensureWorkspace, workspaceSnapshot } from "./db/repositories/workspaceRepository.js";
import { AutoGlmProviderError, autoGlmProviderStatus, testAutoGlmProvider } from "./providers/zhipuAutoGlmProvider.js";
import { emptyPlatformDiscovery, getPlatformAdapter, listPlatformAdapters, platformAdapterStatus, type DiscoveryMediaTypeFilter, type PlatformDiscoveryResult } from "./platforms.js";
import { engagementAgeBucket, scorePositiveEngagementOutlier } from "./scoring/robustAnomaly.js";
import { evaluateViralAdmission, viralAdmissionPassedMessage, viralAdmissionReasons } from "./scoring/viralAdmission.js";
import { scoreViralPost, type ViralScoreResult } from "./scoring/viralScore.js";
import { LocalArtifactStorage, ArtifactStorageError, validateArtifactName } from "./storage/LocalArtifactStorage.js";
import { numberInput, objectInput, optionalString, requiredString, stringArray, uuidParam, ValidationError } from "./validation/input.js";
import { createInsight, getSourceAnalysisContext, listInsights, patchInsight, saveSourceAnalysis, type InsightEvidenceType, type InsightKind } from "./workflows/topicWorkbench.js";
import { createContentDraft, listContentDrafts, patchContentDraft, reviewContentDraft } from "./workflows/contentDraftWorkflow.js";
import { approvePublicationDraft, executePublicationDraft } from "./workflows/publicationWorkflow.js";
import { validateAnalysisPayload } from "./workflows/viralAnalysisContract.js";
import { allIdeaSourcesCurrentlyAdmitted } from "./workflows/ideaSourceEligibility.js";
import { discoveryPolicy, parseMediaTypeFilter, supportsMediaType } from "./platforms/discoveryPolicy.js";
import { runDiscoveryWithFallback } from "./platforms/discoveryFallback.js";

const BASE = "/api/v1";
const storage = new LocalArtifactStorage();
let workspaceId: string | undefined = process.env.MARKETING_PIPELINE_WORKSPACE_ID;
const allowedMimeTypes = new Set(["image/gif", "image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/wav", "video/mp4", "video/quicktime", "video/webm", "application/json", "text/plain"]);

async function ensureSourcePostCover(tx: Prisma.TransactionClient, input: { workspaceId: string; projectId: string; sourcePostId: string; evidence: { bytes: Buffer; mimeType: "image/png" | "image/jpeg" | "image/webp"; capturedAt: string; source: string } }) {
  const existing = await tx.artifactLink.findFirst({ where: { workspaceId: input.workspaceId, projectId: input.projectId, entityType: "source_post", entityId: input.sourcePostId, role: "cover" }, orderBy: { createdAt: "desc" } });
  if (existing) return existing.artifactId;
  const artifactId = randomUUID();
  const extension = input.evidence.mimeType === "image/jpeg" ? "jpg" : input.evidence.mimeType === "image/webp" ? "webp" : "png";
  const originalName = `source-cover-${input.sourcePostId}.${extension}`;
  const stored = await storage.put({ id: artifactId, workspaceId: input.workspaceId, projectId: input.projectId, kind: "source_cover", mimeType: input.evidence.mimeType, originalName, body: Readable.from(input.evidence.bytes) });
  try {
    await tx.artifact.create({ data: { id: artifactId, workspaceId: input.workspaceId, projectId: input.projectId, kind: "source_cover", storageProvider: "local", storageKey: stored.storageKey, originalName, mimeType: input.evidence.mimeType, sizeBytes: BigInt(stored.sizeBytes), sha256: stored.sha256, status: "ready", metadata: normalizeJson({ capturedAt: input.evidence.capturedAt, source: input.evidence.source, purpose: "source_post_cover_evidence" }) } });
    await tx.artifactLink.create({ data: { workspaceId: input.workspaceId, projectId: input.projectId, artifactId, entityType: "source_post", entityId: input.sourcePostId, role: "cover" } });
    return artifactId;
  } catch (error) {
    await storage.delete(artifactId).catch(() => undefined);
    throw error;
  }
}

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
  const platform = requiredString(input.platform, "platform", 50);
  const mediaTypeFilter = normalizeMediaTypeFilter(input.mediaTypeFilter);
  if (!supportsMediaType(platformAdapterStatus(platform).discovery.mediaTypes, mediaTypeFilter)) throw new ValidationError(`${platform} Adapter 不支持内容类型 ${mediaTypeFilter}`);
  const bindingId = typeof input.collectorAccountBindingId === "string" && input.collectorAccountBindingId.trim()
    ? uuidParam(input.collectorAccountBindingId, "collectorAccountBindingId")
    : undefined;
  return {
    name: requiredString(input.name, "name", 200),
    platform,
    terms,
    excludeTerms: stringArray(input.excludeTerms ?? [], "excludeTerms"),
    searchMode: input.searchMode === "sequential" ? "sequential" : "sequential",
    mediaTypeFilter,
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

function normalizeMediaTypeFilter(value: unknown, fallback: DiscoveryMediaTypeFilter = "any"): DiscoveryMediaTypeFilter {
  const parsed = parseMediaTypeFilter(value, fallback);
  if (parsed) return parsed;
  throw new ValidationError("mediaTypeFilter 必须是 any、video 或 image_text");
}

export function topicConfigSnapshot(current: TopicWatch, input: Record<string, unknown>) {
  if (input.platform !== undefined && input.platform !== current.platform) throw new ValidationError("Topic Watch 版本不能更换平台");
  const mediaTypeFilter = normalizeMediaTypeFilter(input.mediaTypeFilter, current.mediaTypeFilter as DiscoveryMediaTypeFilter);
  if (!supportsMediaType(platformAdapterStatus(current.platform).discovery.mediaTypes, mediaTypeFilter)) throw new ValidationError(`${current.platform} Adapter 不支持内容类型 ${mediaTypeFilter}`);
  const collectorAccountBindingId = input.collectorAccountBindingId === undefined
    ? current.collectorAccountBindingId
    : typeof input.collectorAccountBindingId === "string" && input.collectorAccountBindingId.trim()
      ? uuidParam(input.collectorAccountBindingId, "collectorAccountBindingId")
      : null;
  return {
    platform: current.platform,
    name: input.name === undefined ? current.name : requiredString(input.name, "name"),
    state: input.state === "paused" ? "paused" : input.state === "running" ? "running" : current.state,
    terms: input.terms === undefined ? current.terms : stringArray(input.terms, "terms"),
    excludeTerms: input.excludeTerms === undefined ? current.excludeTerms : stringArray(input.excludeTerms, "excludeTerms"),
    searchMode: input.searchMode === undefined ? current.searchMode : "sequential",
    mediaTypeFilter,
    minLikes: numberInput(input.minLikes, "minLikes", current.minLikes),
    minComments: numberInput(input.minComments, "minComments", current.minComments),
    maxAgeHours: numberInput(input.maxAgeHours, "maxAgeHours", current.maxAgeHours, 1),
    minScore: numberInput(input.minScore, "minScore", current.minScore, 0, 100),
    anomalyEnabled: input.anomalyEnabled === undefined ? current.anomalyEnabled : input.anomalyEnabled !== false,
    anomalyMethod: input.anomalyMethod === undefined ? current.anomalyMethod : "robust_mad",
    anomalyBaselineDays: numberInput(input.anomalyBaselineDays, "anomalyBaselineDays", current.anomalyBaselineDays, 7, 365),
    anomalyMinSamples: numberInput(input.anomalyMinSamples, "anomalyMinSamples", current.anomalyMinSamples, 10, 10_000),
    anomalyZThreshold: numberInput(input.anomalyZThreshold, "anomalyZThreshold", current.anomalyZThreshold, 1, 10),
    collectorAccountBindingId,
    cadence: input.cadence === undefined ? current.cadence : requiredString(input.cadence, "cadence"),
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
    { key: "media_type", label: "内容类型", ok: adapter.discovery.mediaTypes.includes(topic.mediaTypeFilter as DiscoveryMediaTypeFilter), detail: adapter.discovery.mediaTypes.includes(topic.mediaTypeFilter as DiscoveryMediaTypeFilter) ? `当前规则：${topic.mediaTypeFilter}` : `${adapter.label} 不支持 ${topic.mediaTypeFilter}` },
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
  let scoreByExternalId = new Map<string, ViralScoreResult>();
  let errorCode = failedCheck ? `PREFLIGHT_${failedCheck.key.toUpperCase()}` : "";
  let errorMessage = failedCheck ? `${failedCheck.label}未就绪：${failedCheck.detail}` : "";
  if (!failedCheck) {
    try {
      const adapter = getPlatformAdapter(topic.platform);
      if (!adapter) throw new Error(`${topic.platform} 平台 Adapter 未注册`);
      const adapterStatus = adapter.status();
      const discoveryRequest = { accountId: account?.id ?? "api", deviceId: runner?.deviceId ?? undefined, traceId, terms: topic.terms, policy: discoveryPolicy(topic.mediaTypeFilter as DiscoveryMediaTypeFilter) };
      type Qualification = { posts: PlatformDiscoveryResult["posts"]; logs: PlatformDiscoveryResult["logs"]; scores: Map<string, ViralScoreResult> };
      const qualifyDiscovery = (candidateDiscovery: PlatformDiscoveryResult): Qualification => {
        for (const post of candidateDiscovery.posts) {
          const missing = adapterStatus.extraction.requiredFields.filter((field) => {
            const value = post[field];
            if (field === "likes" || field === "comments") return typeof value !== "number" || !Number.isFinite(value) || value < 0;
            if (field === "rawPayload") return !value || typeof value !== "object" || Array.isArray(value);
            if (field === "coverEvidence") return !value || typeof value !== "object" || Array.isArray(value) || !Buffer.isBuffer(value.bytes) || value.bytes.length === 0 || typeof value.mimeType !== "string" || !["image/png", "image/jpeg", "image/webp"].includes(value.mimeType) || typeof value.capturedAt !== "string" || Number.isNaN(new Date(value.capturedAt).getTime());
            if (field === "publishedAt") return typeof value !== "string" || !value.trim() || Number.isNaN(new Date(value).getTime());
            return typeof value !== "string" || !value.trim();
          });
          if (missing.length) throw new Error(`${topic.platform} Adapter 违反采集字段合同：${post.externalId || "未知候选"} 缺少 ${missing.join("、")}`);
        }
        const excludes = topic.excludeTerms.map((term) => term.trim().toLocaleLowerCase()).filter(Boolean);
        const scoringCapturedAt = new Date();
        const scores = new Map<string, ViralScoreResult>();
        const qualificationItems = candidateDiscovery.posts.map((post) => {
          const reasons: string[] = [];
          const searchable = `${post.title}\n${post.body ?? ""}\n${post.author}\n${post.term}`.toLocaleLowerCase();
          const matchedExclude = excludes.find((term) => searchable.includes(term));
          if (matchedExclude) reasons.push(`命中排除词：${matchedExclude}`);
          if (topic.mediaTypeFilter === "video" && post.mediaType !== "视频") reasons.push("不符合视频内容类型");
          if (topic.mediaTypeFilter === "image_text" && post.mediaType !== "图文") reasons.push("不符合图文内容类型");
          const scoring = scoreViralPost({ likes: post.likes, comments: post.comments, publishedAt: post.publishedAt!, capturedAt: scoringCapturedAt }, { minLikes: topic.minLikes, minComments: topic.minComments, maxAgeHours: topic.maxAgeHours });
          scores.set(post.externalId, scoring);
          reasons.push(...viralAdmissionReasons(
            { likes: post.likes, comments: post.comments, score: scoring.total },
            { minLikes: topic.minLikes, minComments: topic.minComments, minScore: topic.minScore },
          ));
          return { post, reasons, scoring };
        });
        const logs: PlatformDiscoveryResult["logs"] = qualificationItems.map((item) => ({ timestamp: new Date().toISOString(), level: "info" as const, eventType: item.reasons.length ? "post_skipped" : "post_qualified", message: item.reasons.length ? `跳过帖子：${item.reasons.join("；")}` : viralAdmissionPassedMessage({ likes: item.post.likes, comments: item.post.comments, score: item.scoring.total }, { minLikes: topic.minLikes, minComments: topic.minComments, minScore: topic.minScore }), payload: { externalId: item.post.externalId, likes: item.post.likes, comments: item.post.comments, publishedAt: item.post.publishedAt, score: item.scoring.total, thresholds: { minLikes: topic.minLikes, minComments: topic.minComments, minScore: topic.minScore }, scoring: item.scoring, reasons: item.reasons } }));
        for (const term of topic.terms) {
          const termItems = qualificationItems.filter((item) => item.post.term === term);
          logs.push({ timestamp: new Date().toISOString(), level: "info" as const, eventType: "term_qualification_summary", message: `${term}：检查 ${termItems.length} 条字段完整候选，合格 ${termItems.filter((item) => item.reasons.length === 0).length} 条`, term, payload: { term, captured: termItems.length, qualified: termItems.filter((item) => item.reasons.length === 0).length, candidateLimit: discoveryRequest.policy.candidateLimitPerTerm, mediaTypeFilter: topic.mediaTypeFilter, thresholds: { minLikes: topic.minLikes, minComments: topic.minComments, minScore: topic.minScore } } });
        }
        return { posts: qualificationItems.filter((item) => item.reasons.length === 0).map((item) => item.post), logs, scores };
      };
      const fallback = adapter.discoveryFallback?.enabled() ? (reason: Parameters<NonNullable<typeof adapter.discoveryFallback>["discover"]>[1]) => adapter.discoveryFallback!.discover({ ...discoveryRequest, terms: reason.terms?.length ? reason.terms : discoveryRequest.terms }, reason) : undefined;
      const outcome = await runDiscoveryWithFallback({
        primary: () => adapter.discover(discoveryRequest),
        qualify: qualifyDiscovery,
        acceptedCount: (qualification) => qualification.posts.length,
        missingPartitions: (qualification) => topic.terms.filter((term) => !qualification.posts.some((post) => post.term === term)),
        mergeResults: (primary, fallbackResult) => ({ posts: [...primary.posts, ...fallbackResult.posts], logs: [...primary.logs, ...fallbackResult.logs] }),
        fallback,
      });
      if (outcome.usedFallback) {
        discovery = { posts: outcome.result.posts, logs: [...(outcome.primaryResult?.logs ?? []), { timestamp: new Date().toISOString(), level: "warn", eventType: "discovery_fallback_started", message: `主抓取不可用，切换到手机视觉抓取：${outcome.reason?.message ?? "未知原因"}`, payload: { reason: outcome.reason?.kind, terms: outcome.reason?.terms, traceId } }, ...(outcome.fallbackResult?.logs ?? []), ...(outcome.fallbackError ? [{ timestamp: new Date().toISOString(), level: "warn" as const, eventType: "discovery_fallback_failed", message: `部分追踪词手机视觉回退失败，保留其他追踪词的合格结果：${outcome.fallbackError}`, payload: { terms: outcome.reason?.terms, traceId } }] : []), ...outcome.qualification.logs] };
      } else {
        discovery = { posts: outcome.result.posts, logs: [...outcome.result.logs, ...outcome.qualification.logs] };
      }
      discovered = outcome.qualification.posts;
      scoreByExternalId = outcome.qualification.scores;
      const failedSearch = outcome.result.logs.findLast((event) => event.level === "error" && event.eventType === "search_failed");
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
    const collection = await tx.collectionRun.create({ data: { workspaceId: workspace.id, projectId: topic.projectId, topicWatchId: topic.id, provider: adapterProvider, traceId, inputSnapshot: normalizeJson({ topicWatchId, terms: topic.terms, excludeTerms: topic.excludeTerms, platform: topic.platform, policy: discoveryPolicy(topic.mediaTypeFilter as DiscoveryMediaTypeFilter), thresholds: { minLikes: topic.minLikes, minComments: topic.minComments, maxAgeHours: topic.maxAgeHours, minScore: topic.minScore }, preflight }), status, errorCode: errorCode || undefined, errorMessage: errorMessage || undefined, startedAt, completedAt: new Date() } });
    let outputCount = 0;
    if (!errorCode) {
      const baselineSince = new Date(startedAt.getTime() - topic.anomalyBaselineDays * 86_400_000);
      const matches = topic.anomalyEnabled ? await tx.sourcePostMatch.findMany({ where: { workspaceId: workspace.id, projectId: topic.projectId, topicWatchId: topic.id } }) : [];
      const matchedSourceIds = [...new Set(matches.map((item) => item.sourcePostId))];
      const baselinePosts = matchedSourceIds.length ? await tx.sourcePost.findMany({ where: { id: { in: matchedSourceIds }, workspaceId: workspace.id, projectId: topic.projectId, platform: topic.platform, publishedAt: { not: null } } }) : [];
      const baselinePostById = new Map(baselinePosts.map((item) => [item.id, item]));
      const historical = baselinePosts.length ? await tx.sourceMetricSnapshot.findMany({ where: { workspaceId: workspace.id, projectId: topic.projectId, sourcePostId: { in: baselinePosts.map((item) => item.id) }, capturedAt: { gte: baselineSince } }, orderBy: { capturedAt: "desc" } }) : [];
      for (const post of discovered) {
        const scoring = scoreByExternalId.get(post.externalId) ?? scoreViralPost({ likes: post.likes, comments: post.comments, publishedAt: post.publishedAt!, capturedAt: startedAt }, { minLikes: topic.minLikes, minComments: topic.minComments, maxAgeHours: topic.maxAgeHours });
        const score = scoring.total;
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
        const admissionReason = viralAdmissionPassedMessage({ likes: post.likes, comments: post.comments, score }, { minLikes: topic.minLikes, minComments: topic.minComments, minScore: topic.minScore });
        const reason = anomaly?.state === "positive_outlier" ? `${admissionReason}；同平台同话题正向异常 z=${anomaly.score.toFixed(2)}`
          : anomaly?.state === "insufficient_baseline" ? `${admissionReason}；相对异常基线不足（${anomaly.cohortSize}/${topic.anomalyMinSamples}）`
          : anomaly?.state === "normal" ? `${admissionReason}；相对异常正常（z=${anomaly.score.toFixed(2)}）`
          : admissionReason;
        const canonicalHash = createHash("md5").update(post.canonicalUrl).digest("hex");
        const source = await tx.sourcePost.upsert({ where: { projectId_platform_externalId: { projectId: topic.projectId, platform: topic.platform, externalId: post.externalId } }, create: { workspaceId: workspace.id, projectId: topic.projectId, platform: topic.platform, externalId: post.externalId, canonicalUrl: post.canonicalUrl, canonicalHash, author: post.author, title: post.title, body: post.body ?? "", publishedAt: post.publishedAt ? new Date(post.publishedAt) : undefined, mediaType: post.mediaType, rawPayload: normalizeJson(post.rawPayload) }, update: { canonicalUrl: post.canonicalUrl, canonicalHash, author: post.author, title: post.title, body: post.body ?? "", publishedAt: post.publishedAt ? new Date(post.publishedAt) : undefined, mediaType: post.mediaType, rawPayload: normalizeJson(post.rawPayload) } });
        await ensureSourcePostCover(tx, { workspaceId: workspace.id, projectId: topic.projectId, sourcePostId: source.id, evidence: post.coverEvidence });
        await tx.sourceMetricSnapshot.create({ data: { workspaceId: workspace.id, projectId: topic.projectId, sourcePostId: source.id, likes: post.likes, comments: post.comments, score, rawPayload: normalizeJson({ term: post.term, scoring, anomaly }) } });
        await tx.sourcePostMatch.upsert({ where: { sourcePostId_topicWatchId: { sourcePostId: source.id, topicWatchId: topic.id } }, create: { workspaceId: workspace.id, projectId: topic.projectId, sourcePostId: source.id, topicWatchId: topic.id, score, reason }, update: { score, reason } });
        outputCount += 1;
        if (anomaly) discovery.logs.push({ timestamp: new Date().toISOString(), level: "info", eventType: "anomaly_assessed", message: reason, term: post.term, payload: { externalId: post.externalId, platform: topic.platform, term: post.term, publicationAgeBucket: candidateBucket, cohortSize: anomaly.cohortSize, anomaly } });
        discovery.logs.push({ timestamp: new Date().toISOString(), level: "info", eventType: "source_post_stored", message: `合格帖子已写入爆帖分析池：${post.externalId}`, payload: { sourcePostId: source.id, externalId: post.externalId, score } });
      }
    }
    const audit = await tx.pipelineRun.create({ data: { workspaceId: workspace.id, projectId: topic.projectId, kind: "抓取", status, provider: adapterProvider, traceId, inputCount: topic.terms.length, outputCount, note: errorMessage || `${topic.platform} Discovery 完成，读取 ${outputCount} 条帖子；详情见运行日志`, errorCode: errorCode || undefined, errorMessage: errorMessage || undefined, startedAt, completedAt: new Date() } });
    const events = [...discovery.logs];
    if (failedCheck) events.unshift({ timestamp: new Date().toISOString(), level: "error" as const, eventType: "preflight_failed", message: errorMessage, payload: { check: failedCheck.key } });
    if (errorMessage && !failedCheck) events.push({ timestamp: new Date().toISOString(), level: "error" as const, eventType: "run_failed", message: errorMessage });
    events.push({ timestamp: new Date().toISOString(), level: errorCode ? "error" as const : "info" as const, eventType: errorCode ? "run_failed" : "run_completed", message: errorCode ? `运行结束：${errorMessage}` : `运行结束：检查 ${discovery.logs.filter((item) => item.eventType === "candidate_read" || item.eventType === "candidate_extracted").length} 个候选，取得 ${outputCount} 条真实帖子`, payload: { outputCount } });
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
  const topics = await db.topicWatch.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) } });
  const patternCards = await db.patternCard.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) } });
  const patternVersions = patternCards.length ? await db.patternCardVersion.findMany({ where: { workspaceId: workspace.id, patternCardId: { in: patternCards.map((card) => card.id) } }, orderBy: { version: "desc" } }) : [];
  const latest = new Map<string, typeof metrics[number]>(); for (const metric of metrics) if (!latest.has(metric.sourcePostId)) latest.set(metric.sourcePostId, metric);
  const postById = new Map(posts.map((post) => [post.id, post]));
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const admittedBySource = new Map<string, { match: typeof matches[number]; topic: typeof topics[number]; evaluation: ReturnType<typeof evaluateViralAdmission> }>();
  for (const match of matches) {
    if (admittedBySource.has(match.sourcePostId)) continue;
    const post = postById.get(match.sourcePostId);
    const metric = latest.get(match.sourcePostId);
    const topic = match.topicWatchId ? topicById.get(match.topicWatchId) : undefined;
    if (!post || !metric || !topic) continue;
    const evaluation = evaluateViralAdmission(
      { likes: metric.likes, comments: metric.comments, publishedAt: post.publishedAt, capturedAt: metric.capturedAt },
      { minLikes: topic.minLikes, minComments: topic.minComments, minScore: topic.minScore, maxAgeHours: topic.maxAgeHours },
    );
    if (evaluation.passed) admittedBySource.set(match.sourcePostId, { match, topic, evaluation });
  }
  const visiblePosts = posts.filter((post) => admittedBySource.has(post.id));
  const coverLinks = visiblePosts.length ? await db.artifactLink.findMany({ where: { workspaceId: workspace.id, entityType: "source_post", role: "cover", entityId: { in: visiblePosts.map((post) => post.id) } }, orderBy: { createdAt: "desc" } }) : [];
  const coverBySource = new Map<string, typeof coverLinks[number]>(); for (const link of coverLinks) if (!coverBySource.has(link.entityId)) coverBySource.set(link.entityId, link);
  const cardBySource = new Map(patternCards.map((card) => [card.sourcePostId, card]));
  const latestPattern = new Map<string, typeof patternVersions[number]>(); for (const version of patternVersions) if (!latestPattern.has(version.patternCardId)) latestPattern.set(version.patternCardId, version);
  json(response, 200, visiblePosts.map((post) => {
    const metric = latest.get(post.id);
    const admitted = admittedBySource.get(post.id)!;
    const raw = metric?.rawPayload && typeof metric.rawPayload === "object" && !Array.isArray(metric.rawPayload) ? metric.rawPayload as Record<string, unknown> : {};
    const anomaly = raw.anomaly && typeof raw.anomaly === "object" && !Array.isArray(raw.anomaly) ? raw.anomaly as Record<string, unknown> : undefined;
    const scoring = admitted.evaluation.scoring as unknown as Record<string, unknown> | undefined;
    const components = scoring?.components && typeof scoring.components === "object" && !Array.isArray(scoring.components) ? scoring.components as Record<string, unknown> : undefined;
    const sourceRaw = post.rawPayload && typeof post.rawPayload === "object" && !Array.isArray(post.rawPayload) ? post.rawPayload as Record<string, unknown> : {};
    const signals = [
      post.publishedAt ? `发布时间已确认：${post.publishedAt.toISOString()}` : "发布时间待确认",
      `评分硬阈值结果：${viralAdmissionPassedMessage({ likes: metric?.likes ?? 0, comments: metric?.comments ?? 0, score: admitted.evaluation.score }, admitted.topic)}`,
      anomaly?.state === "insufficient_baseline" ? `相对异常基线不足：${Number(anomaly.cohortSize ?? 0)} 条` : anomaly?.state === "positive_outlier" ? "相对异常：正向爆发" : anomaly?.state === "normal" ? "相对异常：正常波动" : "相对异常：未启用",
    ];
    const likes = metric?.likes ?? 0;
    const comments = metric?.comments ?? 0;
    const card = cardBySource.get(post.id);
    const pattern = card ? latestPattern.get(card.id) : undefined;
    const cover = coverBySource.get(post.id);
    const scoreBreakdown = scoring ? [
      { label: "发布时长", value: typeof scoring.ageHours === "number" ? `${scoring.ageHours.toFixed(1)} 小时` : "—" },
      { label: "点赞速度", value: typeof scoring.likesPerHour === "number" ? `${scoring.likesPerHour.toFixed(2)}/小时` : "—" },
      { label: "评论速度", value: typeof scoring.commentsPerHour === "number" ? `${scoring.commentsPerHour.toFixed(2)}/小时` : "—" },
      { label: "评论率", value: typeof scoring.commentRate === "number" ? `${(scoring.commentRate * 100).toFixed(2)}%` : "—" },
      { label: "时间分", value: typeof components?.freshness === "number" ? components.freshness.toFixed(1) : "—" },
      { label: "点赞速度分", value: typeof components?.likeVelocity === "number" ? components.likeVelocity.toFixed(1) : "—" },
      { label: "评论强度分", value: typeof components?.commentStrength === "number" ? components.commentStrength.toFixed(1) : "—" },
    ] : [{ label: "点赞", value: likes.toLocaleString("zh-CN") }, { label: "评论", value: comments.toLocaleString("zh-CN") }, { label: "评论率", value: likes > 0 ? `${(comments / likes * 100).toFixed(2)}%` : "—" }];
    const currentReason = viralAdmissionPassedMessage({ likes, comments, score: admitted.evaluation.score }, admitted.topic);
    const sourceLink = getPlatformAdapter(post.platform)?.sourceLinkStatus?.({ externalId: post.externalId, canonicalUrl: post.canonicalUrl }) ?? { usable: true };
    return { id: post.id, workspaceId: post.workspaceId, projectId: post.projectId, platform: post.platform, externalId: post.externalId, canonicalUrl: post.canonicalUrl, sourceLink, author: post.author, title: post.title, body: post.body, publishedAt: post.publishedAt, capturedAt: post.capturedAt, mediaType: post.mediaType, createdAt: post.createdAt, updatedAt: post.updatedAt, likes, comments, score: admitted.evaluation.score, reason: currentReason, topic: typeof raw.term === "string" ? raw.term : "", image: cover ? `${BASE}/artifacts/${cover.artifactId}/content` : "", capturedBy: typeof sourceRaw.source === "string" ? sourceRaw.source : "control-api", patternCard: pattern?.payload, patternCardVersion: pattern?.version, evidence: { signals, scoreBreakdown, capturedBy: typeof sourceRaw.source === "string" ? sourceRaw.source : "control-api", capturedAt: metric?.capturedAt ?? post.capturedAt } };
  }));
}

async function captureSourcePostCover(response: ServerResponse, sourcePostId: string) {
  const { db, workspace } = await currentWorkspace();
  uuidParam(sourcePostId, "sourcePostId");
  const post = await db.sourcePost.findFirstOrThrow({ where: { id: sourcePostId, workspaceId: workspace.id } });
  const existing = await db.artifactLink.findFirst({ where: { workspaceId: workspace.id, projectId: post.projectId, entityType: "source_post", entityId: post.id, role: "cover" }, orderBy: { createdAt: "desc" } });
  if (existing) { json(response, 200, { ok: true, artifactId: existing.artifactId, image: `${BASE}/artifacts/${existing.artifactId}/content`, reused: true }); return; }
  const adapter = getPlatformAdapter(post.platform);
  if (!adapter?.captureCover) throw new ValidationError(`${post.platform} Adapter 尚未实现封面补采`);
  const topic = await db.topicWatch.findFirst({ where: { workspaceId: workspace.id, projectId: post.projectId, platform: post.platform, collectorAccountBindingId: { not: null } }, orderBy: { updatedAt: "desc" } });
  const binding = topic?.collectorAccountBindingId ? await db.projectAccountBinding.findFirst({ where: { id: topic.collectorAccountBindingId, workspaceId: workspace.id, projectId: post.projectId } }) : null;
  const account = binding ? await db.socialAccount.findFirst({ where: { id: binding.accountId, workspaceId: workspace.id, lifecycleStatus: "active" } }) : null;
  const runner = account ? await db.accountRunner.findFirst({ where: { accountId: account.id, workspaceId: workspace.id } }) : null;
  if (!account || !runner?.deviceId) throw new ValidationError(`${post.platform} 封面补采缺少已绑定账号或手机 Runner`);
  const evidence = await adapter.captureCover(account.id, { externalId: post.externalId, canonicalUrl: post.canonicalUrl, author: post.author, title: post.title }, runner.deviceId);
  const artifactId = await db.$transaction((tx) => ensureSourcePostCover(tx, { workspaceId: workspace.id, projectId: post.projectId, sourcePostId: post.id, evidence }));
  json(response, 200, { ok: true, artifactId, image: `${BASE}/artifacts/${artifactId}/content`, reused: false });
}

async function rescoreSourcePosts(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace();
  const input = objectInput(await bodyJson(request));
  const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId");
  const posts = await db.sourcePost.findMany({ where: { workspaceId: workspace.id, projectId } });
  const metrics = await db.sourceMetricSnapshot.findMany({ where: { workspaceId: workspace.id, projectId }, orderBy: { capturedAt: "desc" } });
  const matches = await db.sourcePostMatch.findMany({ where: { workspaceId: workspace.id, projectId }, orderBy: { createdAt: "desc" } });
  const topics = await db.topicWatch.findMany({ where: { workspaceId: workspace.id, projectId } });
  const latestMetric = new Map<string, typeof metrics[number]>(); for (const metric of metrics) if (!latestMetric.has(metric.sourcePostId)) latestMetric.set(metric.sourcePostId, metric);
  const postById = new Map(posts.map((post) => [post.id, post]));
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  let updatedMatches = 0;
  let updatedMetrics = 0;
  let unscorable = 0;
  await db.$transaction(async (tx) => {
    const bestByMetric = new Map<string, { score: number; scoring: ViralScoreResult | undefined; reason: string }>();
    for (const match of matches) {
      const post = postById.get(match.sourcePostId);
      const metric = latestMetric.get(match.sourcePostId);
      const topic = match.topicWatchId ? topicById.get(match.topicWatchId) : undefined;
      if (!post || !metric || !topic) continue;
      const evaluation = evaluateViralAdmission(
        { likes: metric.likes, comments: metric.comments, publishedAt: post.publishedAt, capturedAt: metric.capturedAt },
        { minLikes: topic.minLikes, minComments: topic.minComments, minScore: topic.minScore, maxAgeHours: topic.maxAgeHours },
      );
      const reason = evaluation.passed
        ? viralAdmissionPassedMessage({ likes: metric.likes!, comments: metric.comments!, score: evaluation.score }, topic)
        : `未通过硬门槛：${evaluation.reasons.join("；")}`;
      await tx.sourcePostMatch.update({ where: { id: match.id }, data: { score: evaluation.score, reason } });
      const best = bestByMetric.get(metric.id);
      if (!best || evaluation.score > best.score) bestByMetric.set(metric.id, { score: evaluation.score, scoring: evaluation.scoring, reason });
      updatedMatches += 1;
      if (!evaluation.scoring) unscorable += 1;
    }
    for (const [metricId, best] of bestByMetric) {
      const metric = metrics.find((candidate) => candidate.id === metricId)!;
      const oldRaw = metric.rawPayload && typeof metric.rawPayload === "object" && !Array.isArray(metric.rawPayload) ? metric.rawPayload as Record<string, unknown> : {};
      const scoring = best.scoring ?? { version: "velocity-triangle-v1", state: "unscorable", reason: best.reason };
      await tx.sourceMetricSnapshot.update({ where: { id: metric.id }, data: { score: best.score, rawPayload: normalizeJson({ ...oldRaw, scoring }) } });
      updatedMetrics += 1;
    }
  });
  json(response, 200, { ok: true, projectId, updated: updatedMatches, updatedMatches, updatedMetrics, unscorable });
}

function insightKind(value: unknown): InsightKind {
  if (value === "inspiration" || value === "pain_point" || value === "feedback") return value;
  throw new ValidationError("kind 必须是 inspiration、pain_point 或 feedback");
}

function insightEvidenceType(value: unknown): InsightEvidenceType {
  if (value === "post" || value === "comment" || value === "inference") return value;
  throw new ValidationError("evidenceType 必须是 post、comment 或 inference");
}

function editableString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") throw new ValidationError(`${field} 必须是字符串`);
  if (value.length > maxLength) throw new ValidationError(`${field} 长度不能超过 ${maxLength}`);
  return value.trim();
}

function reviewStatus(value: unknown) {
  if (value === "pending" || value === "approved" || value === "rejected") return value;
  throw new ValidationError("status 必须是 pending、approved 或 rejected");
}

function nestedEvidenceIds(payload: Record<string, unknown>) {
  const topicCandidates = Array.isArray(payload.topicCandidates) ? payload.topicCandidates.map(objectInput) : [];
  const insights = Array.isArray(payload.insights) ? payload.insights.map(objectInput) : [];
  return {
    assetIds: [...new Set(topicCandidates.flatMap((candidate) => stringArray(candidate.assetIds ?? [], "topicCandidates.assetIds")))],
    commentIds: [...new Set(insights.flatMap((insight) => stringArray(insight.commentIds ?? [], "insights.commentIds")))],
  };
}

async function analysisContext(_request: IncomingMessage, response: ServerResponse, sourcePostId: string) {
  const { db, workspace } = await currentWorkspace();
  uuidParam(sourcePostId, "sourcePostId");
  json(response, 200, await getSourceAnalysisContext(db, workspace.id, sourcePostId));
}

async function saveAnalysis(request: IncomingMessage, response: ServerResponse, sourcePostId: string) {
  const { db, workspace } = await currentWorkspace();
  uuidParam(sourcePostId, "sourcePostId");
  const input = objectInput(await bodyJson(request));
  const payload = validateAnalysisPayload(input.analysis === undefined ? input : input.analysis);
  const context = await getSourceAnalysisContext(db, workspace.id, sourcePostId);
  const evidenceIds = nestedEvidenceIds(payload);
  const allowedAssets = new Set(context.assets.map((asset) => asset.id));
  const allowedComments = new Set(context.comments.map((comment) => comment.id));
  if (evidenceIds.assetIds.some((id) => !allowedAssets.has(id))) throw new ValidationError("分析引用了不属于当前项目的资产");
  if (evidenceIds.commentIds.some((id) => !allowedComments.has(id))) throw new ValidationError("分析引用了未存储的评论证据");
  const saved = await saveSourceAnalysis(db, workspace.id, sourcePostId, payload, {
    provider: optionalString(input.provider, "provider", 200) ?? "codex-skill",
    providerVersion: optionalString(input.providerVersion, "providerVersion", 200),
    promptVersion: optionalString(input.promptVersion, "promptVersion", 200) ?? "viral-topic-analysis/v1",
  });
  json(response, 200, saved);
}

async function runCommentCollection(request: IncomingMessage, response: ServerResponse, sourcePostId: string) {
  const { db, workspace } = await currentWorkspace();
  uuidParam(sourcePostId, "sourcePostId");
  const input = objectInput(await bodyJson(request));
  const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId");
  const accountId = uuidParam(typeof input.accountId === "string" ? input.accountId : undefined, "accountId");
  const limit = Math.round(numberInput(input.limit, "limit", 100, 1, 500));
  const source = await db.sourcePost.findFirst({ where: { id: sourcePostId, workspaceId: workspace.id, projectId } });
  if (!source) throw new ValidationError("来源帖不存在或不属于当前项目");
  const adapter = getPlatformAdapter(source.platform);
  const status = adapter?.status();
  if (!adapter?.collectComments || !status?.capabilities.commentCollection) throw new ValidationError(`${source.platform} Adapter 未声明评论采集能力`);
  const binding = await db.projectAccountBinding.findFirst({ where: { projectId, accountId, workspaceId: workspace.id, roles: { hasSome: ["discovery", "engagement"] } } });
  if (!binding) throw new ValidationError("所选账号没有当前项目的 Discovery 或 Engagement 角色");
  const account = await db.socialAccount.findFirst({ where: { id: accountId, workspaceId: workspace.id, platform: source.platform, lifecycleStatus: "active" } });
  if (!account) throw new ValidationError("评论采集账号不存在、已归档或平台不匹配");
  const requirements = status.commentCollection?.requirements ?? status.requirements;
  if (requirements.confirmedIdentity && !account.identityConfirmedAt) throw new ValidationError("评论采集账号身份尚未确认");
  const runner = await db.accountRunner.findFirst({ where: { accountId, workspaceId: workspace.id } });
  if (requirements.phoneRunner && (!runner || runner.sessionStatus !== "healthy" || !runner.deviceId || !runner.appPackage)) throw new ValidationError("评论采集需要健康且已绑定设备与 App 的手机 Runner");
  const traceId = randomUUID();
  const agentRun = await db.agentRun.create({ data: { workspaceId: workspace.id, projectId, kind: "comment-collection", status: "running", provider: adapter.id, traceId, inputSnapshot: { sourcePostId, accountId, limit }, startedAt: new Date() } });
  try {
    const result = await adapter.collectComments(accountId, { externalId: source.externalId, canonicalUrl: source.canonicalUrl }, limit, runner?.deviceId ?? undefined);
    const normalized = result.comments.slice(0, limit).map((comment, index) => {
      const body = requiredString(comment.body, `comments[${index}].body`, 10_000);
      const author = optionalString(comment.author, `comments[${index}].author`, 300) ?? "";
      const externalId = optionalString(comment.externalId, `comments[${index}].externalId`, 300);
      const likes = comment.likes === undefined ? undefined : Math.round(numberInput(comment.likes, `comments[${index}].likes`, 0, 0));
      const publishedAt = comment.publishedAt ? new Date(comment.publishedAt) : undefined;
      if (publishedAt && Number.isNaN(publishedAt.getTime())) throw new ValidationError(`comments[${index}].publishedAt 不是有效时间`);
      const evidenceHash = createHash("sha256").update([externalId ?? "", author, body, publishedAt?.toISOString() ?? ""].join("\0")).digest("hex");
      return { body, author, externalId, likes, publishedAt, evidenceHash };
    });
    const saved = await db.$transaction(async (tx) => {
      const comments = [];
      for (const comment of normalized) comments.push(await tx.sourceComment.upsert({ where: { sourcePostId_evidenceHash: { sourcePostId, evidenceHash: comment.evidenceHash } }, create: { workspaceId: workspace.id, projectId, sourcePostId, ...comment, rawPayload: { collector: adapter.id } }, update: { externalId: comment.externalId, author: comment.author, body: comment.body, likes: comment.likes, publishedAt: comment.publishedAt, capturedAt: new Date(), rawPayload: { collector: adapter.id } } }));
      await tx.agentRun.update({ where: { id: agentRun.id }, data: { status: "completed", outputSnapshot: { sourcePostId, commentIds: comments.map((comment) => comment.id), count: comments.length }, completedAt: new Date() } });
      await tx.auditLog.create({ data: { workspaceId: workspace.id, projectId, actor: "control-api", action: "source_comments.collected", entityType: "source_post", entityId: sourcePostId, after: { count: comments.length, provider: adapter.id }, traceId } });
      return comments;
    });
    json(response, 200, { runId: agentRun.id, traceId, comments: saved.map((comment) => ({ id: comment.id, body: comment.body, likes: comment.likes, publishedAt: comment.publishedAt, capturedAt: comment.capturedAt })) });
  } catch (error) {
    await db.agentRun.update({ where: { id: agentRun.id }, data: { status: "failed", errorCode: error instanceof ValidationError ? error.code : "COMMENT_COLLECTION_FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 2000) : "评论采集失败", completedAt: new Date() } });
    throw error;
  }
}

async function listInsightRecords(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace();
  const projectId = new URL(request.url ?? "", "http://127.0.0.1").searchParams.get("projectId") ?? undefined;
  if (projectId) uuidParam(projectId, "projectId");
  json(response, 200, await listInsights(db, workspace.id, projectId));
}

async function createInsightRecord(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace();
  const input = objectInput(await bodyJson(request));
  const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId");
  const record = await createInsight(db, workspace.id, {
    projectId,
    sourcePostId: input.sourcePostId === undefined ? undefined : uuidParam(typeof input.sourcePostId === "string" ? input.sourcePostId : undefined, "sourcePostId"),
    ideaId: input.ideaId === undefined ? undefined : uuidParam(typeof input.ideaId === "string" ? input.ideaId : undefined, "ideaId"),
    kind: insightKind(input.kind),
    title: requiredString(input.title, "title", 300),
    detail: requiredString(input.detail, "detail", 5000),
    evidenceType: insightEvidenceType(input.evidenceType ?? "inference"),
    commentIds: stringArray(input.commentIds ?? [], "commentIds").map((id) => uuidParam(id, "commentId")),
    status: input.status === undefined ? "pending" : reviewStatus(input.status),
    createdBy: optionalString(input.createdBy, "createdBy", 100) ?? "dashboard",
  });
  json(response, 201, record);
}

async function patchInsightRecord(request: IncomingMessage, response: ServerResponse, insightId: string) {
  const { db, workspace } = await currentWorkspace();
  uuidParam(insightId, "insightId");
  const input = objectInput(await bodyJson(request));
  const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId");
  const record = await patchInsight(db, workspace.id, projectId, insightId, {
    sourcePostId: input.sourcePostId === undefined ? undefined : uuidParam(typeof input.sourcePostId === "string" ? input.sourcePostId : undefined, "sourcePostId"),
    ideaId: input.ideaId === undefined ? undefined : uuidParam(typeof input.ideaId === "string" ? input.ideaId : undefined, "ideaId"),
    kind: input.kind === undefined ? undefined : insightKind(input.kind),
    title: input.title === undefined ? undefined : requiredString(input.title, "title", 300),
    detail: input.detail === undefined ? undefined : requiredString(input.detail, "detail", 5000),
    evidenceType: input.evidenceType === undefined ? undefined : insightEvidenceType(input.evidenceType),
    commentIds: input.commentIds === undefined ? undefined : stringArray(input.commentIds, "commentIds").map((id) => uuidParam(id, "commentId")),
    status: input.status === undefined ? undefined : reviewStatus(input.status),
  });
  json(response, 200, record);
}

async function createContentDraftRecord(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace();
  const input = objectInput(await bodyJson(request));
  const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId");
  const ideaId = uuidParam(typeof input.ideaId === "string" ? input.ideaId : undefined, "ideaId");
  const record = await createContentDraft(db, workspace.id, {
    projectId,
    ideaId,
    title: input.title === undefined ? undefined : requiredString(input.title, "title", 300),
    copy: input.copy === undefined ? undefined : editableString(input.copy, "copy", 20_000),
    format: input.format === undefined ? undefined : requiredString(input.format, "format", 50),
    assetStrategy: input.assetStrategy === undefined ? undefined : requiredString(input.assetStrategy, "assetStrategy", 100),
    assetIds: input.assetIds === undefined ? undefined : stringArray(input.assetIds, "assetIds").map((id) => uuidParam(id, "assetId")),
    imageBrief: input.imageBrief === undefined ? undefined : editableString(input.imageBrief, "imageBrief", 10_000),
    videoBrief: input.videoBrief === undefined ? undefined : input.videoBrief === null ? Prisma.JsonNull : normalizeJson(input.videoBrief),
    createdBy: optionalString(input.createdBy, "createdBy", 100) ?? "dashboard",
  });
  json(response, 201, record);
}

async function listContentDraftRecords(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace();
  const projectId = new URL(request.url ?? "", "http://127.0.0.1").searchParams.get("projectId") ?? undefined;
  if (projectId) uuidParam(projectId, "projectId");
  json(response, 200, await listContentDrafts(db, workspace.id, projectId));
}

async function patchContentDraftRecord(request: IncomingMessage, response: ServerResponse, draftId: string) {
  const { db, workspace } = await currentWorkspace();
  uuidParam(draftId, "contentDraftId");
  const input = objectInput(await bodyJson(request));
  const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId");
  const record = await patchContentDraft(db, workspace.id, projectId, draftId, {
    title: input.title === undefined ? undefined : requiredString(input.title, "title", 300),
    copy: input.copy === undefined ? undefined : editableString(input.copy, "copy", 20_000),
    format: input.format === undefined ? undefined : requiredString(input.format, "format", 50),
    assetStrategy: input.assetStrategy === undefined ? undefined : requiredString(input.assetStrategy, "assetStrategy", 100),
    assetIds: input.assetIds === undefined ? undefined : stringArray(input.assetIds, "assetIds").map((id) => uuidParam(id, "assetId")),
    imageBrief: input.imageBrief === undefined ? undefined : editableString(input.imageBrief, "imageBrief", 10_000),
    videoBrief: input.videoBrief === undefined ? undefined : input.videoBrief === null ? Prisma.JsonNull : normalizeJson(input.videoBrief),
    createdBy: optionalString(input.createdBy, "createdBy", 100) ?? "dashboard",
  });
  json(response, 200, record);
}

async function reviewContentDraftRecord(request: IncomingMessage, response: ServerResponse, draftId: string) {
  const { db, workspace } = await currentWorkspace();
  uuidParam(draftId, "contentDraftId");
  const input = objectInput(await bodyJson(request));
  const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId");
  const status = input.status === "approved" ? "approved" : input.status === "rejected" ? "rejected" : input.status === "pending_review" ? "pending_review" : undefined;
  if (!status) throw new ValidationError("status 必须是 pending_review、approved 或 rejected");
  json(response, 200, await reviewContentDraft(db, workspace.id, projectId, draftId, status, optionalString(input.reason, "reason", 1000)));
}

function ideaPayload(idea: Record<string, unknown>, revision?: Record<string, unknown>, sources: string[] = [], targets: string[] = []) { return { ...idea, hook: revision?.hook || "", copy: revision?.copy || "", videoPrompt: revision?.videoSpec && typeof revision.videoSpec === "object" ? (revision.videoSpec as Record<string, unknown>).prompt : undefined, videoBrief: revision?.videoBrief, imageBrief: revision?.imageBrief, assetMatch: revision?.assetDecision, assetIds: revision?.assetIds ?? [], source: sources[0] || "", sourcePostIds: sources, platforms: targets, updatedAt: idea.updatedAt }; }

async function listIdeas(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace(); const projectId = new URL(request.url ?? "", "http://127.0.0.1").searchParams.get("projectId"); const ideas = await db.idea.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) }, orderBy: { updatedAt: "desc" } }); const revisions = await db.ideaRevision.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) }, orderBy: { version: "desc" } }); const sources = await db.ideaSource.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) } }); const targets = await db.ideaPlatformTarget.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) } }); return json(response, 200, ideas.map((idea) => ideaPayload(idea, revisions.find((revision) => revision.ideaId === idea.id), sources.filter((source) => source.ideaId === idea.id).map((source) => source.sourcePostId).filter((id): id is string => Boolean(id)), targets.filter((target) => target.ideaId === idea.id).map((target) => target.platform))));
}

async function createIdeas(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace();
  const input = objectInput(await bodyJson(request));
  const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId");
  const sourceIds = stringArray(input.sourcePostIds ?? [], "sourcePostIds").map((id) => uuidParam(id, "sourcePostId"));
  const sources = await db.sourcePost.findMany({ where: { workspaceId: workspace.id, projectId, id: { in: sourceIds } } });
  if (sources.length !== sourceIds.length) throw new ValidationError("部分选题来源帖不存在或不属于当前项目");
  if (sourceIds.length) {
    const [metrics, matches, topics] = await Promise.all([
      db.sourceMetricSnapshot.findMany({ where: { workspaceId: workspace.id, projectId, sourcePostId: { in: sourceIds } }, orderBy: { capturedAt: "desc" } }),
      db.sourcePostMatch.findMany({ where: { workspaceId: workspace.id, projectId, sourcePostId: { in: sourceIds } }, orderBy: { createdAt: "desc" } }),
      db.topicWatch.findMany({ where: { workspaceId: workspace.id, projectId } }),
    ]);
    const allCurrentlyAdmitted = allIdeaSourcesCurrentlyAdmitted(sources, metrics, matches, topics);
    if (!allCurrentlyAdmitted) throw new ValidationError("选题来源必须继续通过当前 TopicWatch 的点赞、评论和评分硬门槛");
  }
  const items = Array.isArray(input.ideas)
    ? input.ideas.map((item) => objectInput(item))
    : [{ title: requiredString(input.title, "title", 300), hook: optionalString(input.hook, "hook", 2000) ?? "", copy: optionalString(input.copy, "copy", 5000) ?? "", format: optionalString(input.format, "format", 50) ?? "纯文本", assetMatch: input.assetMatch, assetIds: input.assetIds, imageBrief: input.imageBrief, videoBrief: input.videoBrief, videoPrompt: input.videoPrompt }];
  if (!items.length || items.length > 50) throw new ValidationError("ideas 必须包含 1–50 条真实选题内容");
  if (input.count !== undefined && numberInput(input.count, "count", items.length, 1, 50) !== items.length) throw new ValidationError("count 必须与实际提交的 ideas 数量一致；服务端不会复制占位选题凑数");
  const platforms = stringArray(input.platforms ?? [], "platforms");
  const assetIds = [...new Set(items.flatMap((item) => stringArray(item.assetIds ?? [], "ideas.assetIds").map((id) => uuidParam(id, "assetId"))))];
  if (assetIds.length) {
    const ownedAssets = await db.asset.count({ where: { id: { in: assetIds }, workspaceId: workspace.id, projectId, status: "available" } });
    if (ownedAssets !== assetIds.length) throw new ValidationError("部分选题资产不存在或不属于当前项目");
  }
  const patterns = sourceIds.length ? await db.patternCard.findMany({ where: { sourcePostId: { in: sourceIds }, workspaceId: workspace.id, projectId } }) : [];
  const patternBySource = new Map(patterns.map((pattern) => [pattern.sourcePostId, pattern.id]));
  const patternVersions = patterns.length ? await db.patternCardVersion.findMany({ where: { patternCardId: { in: patterns.map((pattern) => pattern.id) }, workspaceId: workspace.id, projectId }, orderBy: { version: "desc" } }) : [];
  const versionByPattern = new Map<string, typeof patternVersions[number]>();
  for (const version of patternVersions) if (!versionByPattern.has(version.patternCardId)) versionByPattern.set(version.patternCardId, version);
  const generationBatchId = randomUUID();
  const created = await db.$transaction(async (tx) => {
    const output = [];
    for (const item of items) {
      const title = requiredString(item.title, "ideas.title", 300);
      const format = requiredString(item.format ?? "纯文本", "ideas.format", 50);
      const itemAssetIds = stringArray(item.assetIds ?? [], "ideas.assetIds").map((id) => uuidParam(id, "assetId"));
      const rawAssetStrategy = optionalString(item.assetMatch ?? item.assetStrategy, "ideas.assetStrategy", 100) ?? "pending";
      const assetDecision = rawAssetStrategy === "reuse_project_asset" ? "matched" : rawAssetStrategy === "generate_style_similar" ? "needs_generation" : rawAssetStrategy === "no_asset" ? "not_applicable" : rawAssetStrategy;
      if (!new Set(["pending", "matched", "needs_generation", "not_applicable"]).has(assetDecision)) throw new ValidationError("ideas.assetStrategy 不受支持");
      const copy = optionalString(item.copy, "ideas.copy", 10_000) ?? (item.copyOutline === undefined ? "" : stringArray(item.copyOutline, "ideas.copyOutline").join("\n"));
      const videoBrief = item.videoBrief === undefined && item.videoPlaceholder !== undefined ? { status: "reserved", prompt: requiredString(item.videoPlaceholder, "ideas.videoPlaceholder", 10_000) } : item.videoBrief;
      const idea = await tx.idea.create({ data: { workspaceId: workspace.id, projectId, title, format, generationBatchId } });
      const revision = await tx.ideaRevision.create({ data: { workspaceId: workspace.id, projectId, ideaId: idea.id, version: 1, hook: optionalString(item.hook, "ideas.hook", 2000) ?? "", copy, videoSpec: item.videoPrompt ? { prompt: requiredString(item.videoPrompt, "ideas.videoPrompt", 10_000) } : undefined, assetDecision, assetIds: itemAssetIds, imageBrief: optionalString(item.imageBrief, "ideas.imageBrief", 10_000), videoBrief: videoBrief === undefined ? undefined : normalizeJson(videoBrief), promptVersion: optionalString(input.promptVersion, "promptVersion", 200), createdBy: optionalString(input.createdBy, "createdBy", 100) ?? "dashboard" } });
      for (const sourcePostId of sourceIds) { const patternCardId = patternBySource.get(sourcePostId); await tx.ideaSource.create({ data: { workspaceId: workspace.id, projectId, ideaId: idea.id, sourcePostId, patternCardId, patternCardVersionId: patternCardId ? versionByPattern.get(patternCardId)?.id : undefined } }); }
      for (const platform of platforms) await tx.ideaPlatformTarget.create({ data: { workspaceId: workspace.id, projectId, ideaId: idea.id, platform } });
      output.push(ideaPayload(idea, revision, sourceIds, platforms));
    }
    return output;
  });
  json(response, 201, created);
}

async function patchIdea(request: IncomingMessage, response: ServerResponse, id: string) {
  const { db, workspace } = await currentWorkspace();
  uuidParam(id, "ideaId");
  const input = objectInput(await bodyJson(request));
  const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId");
  const current = await db.idea.findFirst({ where: { id, workspaceId: workspace.id, projectId } });
  if (!current) throw new ValidationError("选题不存在或不属于当前项目");
  const currentRevision = await db.ideaRevision.findFirst({ where: { ideaId: id, workspaceId: workspace.id }, orderBy: { version: "desc" } });
  const sources = await db.ideaSource.findMany({ where: { ideaId: id, workspaceId: workspace.id } });
  const targets = await db.ideaPlatformTarget.findMany({ where: { ideaId: id, workspaceId: workspace.id } });
  const version = current.currentVersion + 1;
  const nextAssetIds = input.assetIds === undefined ? currentRevision?.assetIds ?? [] : stringArray(input.assetIds, "assetIds").map((assetId) => uuidParam(assetId, "assetId"));
  if (nextAssetIds.length) {
    const count = await db.asset.count({ where: { id: { in: nextAssetIds }, workspaceId: workspace.id, projectId: current.projectId, status: "available" } });
    if (count !== nextAssetIds.length) throw new ValidationError("部分选题资产不存在或不属于当前项目");
  }
  const revision = await db.$transaction(async (tx) => {
    const idea = await tx.idea.update({ where: { id }, data: { title: input.title === undefined ? undefined : requiredString(input.title, "title", 300), format: input.format === undefined ? undefined : requiredString(input.format, "format", 50), currentVersion: version, status: "candidate" } });
    const next = await tx.ideaRevision.create({ data: { workspaceId: workspace.id, projectId: current.projectId, ideaId: id, version, hook: input.hook === undefined ? currentRevision?.hook ?? "" : optionalString(input.hook, "hook", 2000) ?? "", copy: input.copy === undefined ? currentRevision?.copy ?? "" : optionalString(input.copy, "copy", 10_000) ?? "", videoSpec: input.videoPrompt === undefined ? currentRevision?.videoSpec ?? undefined : input.videoPrompt ? { prompt: requiredString(input.videoPrompt, "videoPrompt", 10_000) } : Prisma.JsonNull, assetDecision: input.assetMatch === undefined ? currentRevision?.assetDecision : optionalString(input.assetMatch, "assetMatch", 100), assetIds: nextAssetIds, imageBrief: input.imageBrief === undefined ? currentRevision?.imageBrief : optionalString(input.imageBrief, "imageBrief", 10_000), videoBrief: input.videoBrief === undefined ? currentRevision?.videoBrief ?? undefined : input.videoBrief ? normalizeJson(input.videoBrief) : Prisma.JsonNull, promptVersion: optionalString(input.promptVersion, "promptVersion", 200) ?? currentRevision?.promptVersion, createdBy: optionalString(input.createdBy, "createdBy", 100) ?? "dashboard" } });
    return { idea, revision: next };
  });
  json(response, 200, ideaPayload(revision.idea, revision.revision, sources.map((source) => source.sourcePostId).filter((sourceId): sourceId is string => Boolean(sourceId)), targets.map((target) => target.platform)));
}

async function reviewIdeas(request: IncomingMessage, response: ServerResponse) { const { db, workspace } = await currentWorkspace(); const input = objectInput(await bodyJson(request)); const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId"); const ids = stringArray(input.ids ?? [], "ids").map((id) => uuidParam(id, "ideaId")); const status = input.status === "approved" ? "approved" : input.status === "rejected" ? "rejected" : "candidate"; const updated = await db.$transaction(async (tx) => { const ideas = await tx.idea.findMany({ where: { id: { in: ids }, workspaceId: workspace.id, projectId } }); if (ideas.length !== ids.length) throw new ValidationError("部分选题不存在或不属于当前项目"); for (const idea of ideas) { await tx.idea.update({ where: { id: idea.id }, data: { status } }); await tx.reviewDecision.create({ data: { workspaceId: workspace.id, projectId: idea.projectId, entityType: "idea", entityId: idea.id, status: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending", reason: optionalString(input.reason, "reason", 1000), reviewer: "dashboard", objectVersion: idea.currentVersion } }); } return ids.length; }); json(response, 200, { updated }); }

async function createGenerationRun(request: IncomingMessage, response: ServerResponse) { const { db, workspace } = await currentWorkspace(); const input = objectInput(await bodyJson(request)); const key = idempotencyKey(request, input); if (key) { const existing = await db.idempotencyKey.findUnique({ where: { workspaceId_key_operation: { workspaceId: workspace.id, key, operation: "generation-run.create" } } }); if (existing?.response) { json(response, 200, existing.response); return; } } const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId"); const provider = optionalString(input.provider, "provider", 200) ?? "unconfigured"; const traceId = optionalString(input.traceId, "traceId", 200) ?? randomUUID(); const run = await db.$transaction(async (tx) => { const created = await tx.generationRun.create({ data: { workspaceId: workspace.id, projectId, ideaId: typeof input.ideaId === "string" ? input.ideaId : undefined, provider, providerVersion: optionalString(input.providerVersion, "providerVersion", 200), promptVersion: optionalString(input.promptVersion, "promptVersion", 200), traceId, idempotencyKey: key, inputSnapshot: normalizeJson(input), status: "queued", errorCode: provider === "unconfigured" ? "PROVIDER_NOT_CONFIGURED" : undefined, errorMessage: provider === "unconfigured" ? "生成 Provider 尚未配置，任务未执行" : undefined } }); if (key) await tx.idempotencyKey.create({ data: { workspaceId: workspace.id, key, operation: "generation-run.create", requestHash: randomUUID(), response: jsonSnapshot(created) } }); return created; }); json(response, 201, run); }

async function createPublicationDraft(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace();
  const input = objectInput(await bodyJson(request));
  const key = idempotencyKey(request, input);
  if (key) {
    const existing = await db.idempotencyKey.findUnique({ where: { workspaceId_key_operation: { workspaceId: workspace.id, key, operation: "publication-draft.create" } } });
    if (existing?.response) { json(response, 200, existing.response); return; }
  }
  const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId");
  const contentDraftId = uuidParam(typeof input.contentDraftId === "string" ? input.contentDraftId : undefined, "contentDraftId");
  const accountId = uuidParam(typeof input.accountId === "string" ? input.accountId : undefined, "accountId");
  const platform = requiredString(input.platform, "platform", 50);
  const contentDraft = await db.contentDraft.findFirst({ where: { id: contentDraftId, projectId, workspaceId: workspace.id } });
  if (!contentDraft || contentDraft.status !== "approved") throw new ValidationError("只有已批准且属于当前项目的待审草稿才能进入发布队列");
  const revision = await db.contentDraftRevision.findFirst({ where: { contentDraftId, workspaceId: workspace.id }, orderBy: { version: "desc" } });
  if (!revision) throw new ValidationError("待审草稿没有可发布版本");
  const account = await db.socialAccount.findFirst({ where: { id: accountId, workspaceId: workspace.id, platform, lifecycleStatus: "active" } });
  if (!account) throw new ValidationError("发布账号不存在、已归档或平台不匹配");
  const binding = await db.projectAccountBinding.findFirst({ where: { projectId, accountId, workspaceId: workspace.id, roles: { has: "publishing" } } });
  if (!binding) throw new ValidationError("所选账号没有当前项目的 Publishing 角色");
  if (revision.assetStrategy === "pending") throw new ValidationError("发布前必须明确图片/资产策略");
  const assetVersions = revision.assetIds.length ? await db.assetVersion.findMany({ where: { assetId: { in: revision.assetIds }, projectId, workspaceId: workspace.id, artifactId: { not: null } }, orderBy: { version: "desc" } }) : [];
  const latestAssetVersion = new Map<string, typeof assetVersions[number]>();
  for (const version of assetVersions) if (!latestAssetVersion.has(version.assetId)) latestAssetVersion.set(version.assetId, version);
  const artifactIds = revision.assetIds.flatMap((assetId) => latestAssetVersion.get(assetId)?.artifactId ?? []);
  if (revision.assetIds.length && artifactIds.length !== revision.assetIds.length) throw new ValidationError("部分发布资产没有可用 Artifact");
  if ((revision.assetStrategy === "matched" || revision.assetStrategy === "needs_generation" || revision.assetStrategy === "reuse_project_asset" || revision.assetStrategy === "generate_style_similar") && !revision.assetIds.length) throw new ValidationError("当前资产策略要求至少一个已登记的项目或生成资产");
  const result = await db.$transaction(async (tx) => {
    const rendition = await tx.platformRendition.create({ data: { workspaceId: workspace.id, projectId, ideaId: contentDraft.ideaId, platform, locale: optionalString(input.locale, "locale", 50) ?? "default", title: revision.title, copy: revision.copy, artifactId: artifactIds[0], version: revision.version, metadata: normalizeJson({ contentDraftId, contentDraftRevision: revision.version, assetStrategy: revision.assetStrategy, assetIds: revision.assetIds, artifactIds, imageBrief: revision.imageBrief, videoBrief: revision.videoBrief, sourceSnapshot: revision.sourceSnapshot }) } });
    const draft = await tx.publicationDraft.create({ data: { workspaceId: workspace.id, projectId, contentDraftId, renditionId: rendition.id, accountId, platform, idempotencyKey: key } });
    const output = { ...draft, rendition, contentDraft, revision };
    if (key) await tx.idempotencyKey.create({ data: { workspaceId: workspace.id, key, operation: "publication-draft.create", requestHash: randomUUID(), response: jsonSnapshot(output) } });
    await tx.auditLog.create({ data: { workspaceId: workspace.id, projectId, actor: "dashboard", action: "publication_draft.created", entityType: "publication_draft", entityId: draft.id, after: { contentDraftId, renditionId: rendition.id, accountId, platform, contentDraftRevision: revision.version } } });
    return output;
  });
  json(response, 201, result);
}

async function listPublicationDraftRecords(request: IncomingMessage, response: ServerResponse) {
  const { db, workspace } = await currentWorkspace();
  const projectId = new URL(request.url ?? "", "http://127.0.0.1").searchParams.get("projectId") ?? undefined;
  if (projectId) uuidParam(projectId, "projectId");
  const drafts = await db.publicationDraft.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) }, orderBy: { createdAt: "desc" } });
  const renditionIds = drafts.map((draft) => draft.renditionId).filter((id): id is string => Boolean(id));
  const contentDraftIds = drafts.map((draft) => draft.contentDraftId).filter((id): id is string => Boolean(id));
  const [renditions, contentDrafts, revisions, receipts] = await Promise.all([
    renditionIds.length ? db.platformRendition.findMany({ where: { id: { in: renditionIds }, workspaceId: workspace.id } }) : [],
    contentDraftIds.length ? db.contentDraft.findMany({ where: { id: { in: contentDraftIds }, workspaceId: workspace.id } }) : [],
    contentDraftIds.length ? db.contentDraftRevision.findMany({ where: { contentDraftId: { in: contentDraftIds }, workspaceId: workspace.id }, orderBy: { version: "desc" } }) : [],
    drafts.length ? db.publicationReceipt.findMany({ where: { publicationDraftId: { in: drafts.map((draft) => draft.id) }, workspaceId: workspace.id }, orderBy: { createdAt: "desc" } }) : [],
  ]);
  const renditionById = new Map(renditions.map((rendition) => [rendition.id, rendition]));
  const contentDraftById = new Map(contentDrafts.map((draft) => [draft.id, draft]));
  const revisionByDraftAndVersion = new Map(revisions.map((revision) => [`${revision.contentDraftId}:${revision.version}`, revision]));
  const receiptByDraft = new Map<string, typeof receipts[number]>(); for (const receipt of receipts) if (!receiptByDraft.has(receipt.publicationDraftId)) receiptByDraft.set(receipt.publicationDraftId, receipt);
  json(response, 200, drafts.map((draft) => { const rendition = draft.renditionId ? renditionById.get(draft.renditionId) : undefined; return { ...draft, rendition, contentDraft: draft.contentDraftId ? contentDraftById.get(draft.contentDraftId) : undefined, revision: draft.contentDraftId && rendition ? revisionByDraftAndVersion.get(`${draft.contentDraftId}:${rendition.version}`) : undefined, receipt: receiptByDraft.get(draft.id) }; }));
}

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
      if (request.method === "PATCH" && !topics[2]) {
        const input = objectInput(await bodyJson(request));
        const current = await db.topicWatch.findFirstOrThrow({ where: { id, workspaceId: workspace.id } });
        const version = current.currentVersion + 1;
        const nextConfig = topicConfigSnapshot(current, input);
        const updated = await db.$transaction(async (tx) => {
          const topic = await tx.topicWatch.update({ where: { id }, data: { ...nextConfig, currentVersion: version } });
          await tx.topicWatchVersion.create({ data: { workspaceId: workspace.id, projectId: current.projectId, topicWatchId: id, version, config: normalizeJson(nextConfig) } });
          return topic;
        });
        json(response, 200, updated);
        return;
      }
      if (request.method === "POST" && topics[2] === "versions") {
        const input = objectInput(await bodyJson(request));
        const current = await db.topicWatch.findFirstOrThrow({ where: { id, workspaceId: workspace.id } });
        const version = current.currentVersion + 1;
        const nextConfig = topicConfigSnapshot(current, objectInput(input.config ?? input));
        json(response, 201, await db.$transaction(async (tx) => {
          const topic = await tx.topicWatch.update({ where: { id }, data: { ...nextConfig, currentVersion: version } });
          await tx.topicWatchVersion.create({ data: { workspaceId: workspace.id, projectId: current.projectId, topicWatchId: id, version, config: normalizeJson(nextConfig) } });
          return topic;
        }));
        return;
      }
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
    if (pathname === `${BASE}/source-posts/rescore` && request.method === "POST") { await rescoreSourcePosts(request, response); return; }
    const sourceCover = pathname.match(new RegExp(`^${BASE}/source-posts/([^/]+)/cover$`));
    if (sourceCover && request.method === "POST") { await captureSourcePostCover(response, sourceCover[1]); return; }
    const sourceAnalysis = pathname.match(new RegExp(`^${BASE}/source-posts/([^/]+)/(analysis-context|analysis|comment-runs)$`));
    if (sourceAnalysis && request.method === "GET" && sourceAnalysis[2] === "analysis-context") { await analysisContext(request, response, sourceAnalysis[1]); return; }
    if (sourceAnalysis && request.method === "PUT" && sourceAnalysis[2] === "analysis") { await saveAnalysis(request, response, sourceAnalysis[1]); return; }
    if (sourceAnalysis && request.method === "POST" && sourceAnalysis[2] === "comment-runs") { await runCommentCollection(request, response, sourceAnalysis[1]); return; }
    const ideas = pathname.match(new RegExp(`^${BASE}/ideas(?:/([^/]+))?$`));
    if (ideas && request.method === "GET" && !ideas[1]) { await listIdeas(request, response); return; }
    if (ideas && request.method === "POST" && !ideas[1]) { await createIdeas(request, response); return; }
    if (ideas && request.method === "PATCH" && ideas[1]) { await patchIdea(request, response, ideas[1]); return; }
    if (pathname === `${BASE}/ideas/reviews` && request.method === "POST") { await reviewIdeas(request, response); return; }
    const insights = pathname.match(new RegExp(`^${BASE}/insights(?:/([^/]+))?$`));
    if (insights && request.method === "GET" && !insights[1]) { await listInsightRecords(request, response); return; }
    if (insights && request.method === "POST" && !insights[1]) { await createInsightRecord(request, response); return; }
    if (insights && request.method === "PATCH" && insights[1]) { await patchInsightRecord(request, response, insights[1]); return; }
    const contentDrafts = pathname.match(new RegExp(`^${BASE}/content-drafts(?:/([^/]+))?(?:/(review))?$`));
    if (contentDrafts && request.method === "GET" && !contentDrafts[1]) { await listContentDraftRecords(request, response); return; }
    if (contentDrafts && request.method === "POST" && !contentDrafts[1]) { await createContentDraftRecord(request, response); return; }
    if (contentDrafts && request.method === "PATCH" && contentDrafts[1] && !contentDrafts[2]) { await patchContentDraftRecord(request, response, contentDrafts[1]); return; }
    if (contentDrafts && request.method === "POST" && contentDrafts[1] && contentDrafts[2] === "review") { await reviewContentDraftRecord(request, response, contentDrafts[1]); return; }
    const generation = pathname.match(new RegExp(`^${BASE}/generation-runs(?:/([^/]+))?$`));
    if (generation && request.method === "POST" && !generation[1]) { await createGenerationRun(request, response); return; }
    if (generation && request.method === "GET") { const { db, workspace } = await currentWorkspace(); const projectId = new URL(request.url ?? "", "http://127.0.0.1").searchParams.get("projectId"); const run = generation[1] ? await db.generationRun.findFirstOrThrow({ where: { id: generation[1], workspaceId: workspace.id } }) : await db.generationRun.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) }, orderBy: { createdAt: "desc" } }); json(response, 200, run); return; }
    if (generation && request.method === "PATCH" && generation[1]) { const { db, workspace } = await currentWorkspace(); const input = objectInput(await bodyJson(request)); const current = await db.generationRun.findFirstOrThrow({ where: { id: generation[1], workspaceId: workspace.id } }); json(response, 200, await db.generationRun.update({ where: { id: current.id }, data: { inputSnapshot: normalizeJson(input), promptVersion: optionalString(input.promptVersion, "promptVersion", 200), errorCode: undefined, errorMessage: undefined } })); return; }
    const publication = pathname.match(new RegExp(`^${BASE}/publication-drafts(?:/([^/]+))?(?:/(approve|execute))?$`));
    if (publication && request.method === "POST" && !publication[1]) { await createPublicationDraft(request, response); return; }
    if (publication && request.method === "POST" && publication[1] && publication[2] === "approve") { const { db, workspace } = await currentWorkspace(); uuidParam(publication[1], "publicationDraftId"); const input = objectInput(await bodyJson(request)); const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId"); json(response, 200, await approvePublicationDraft(db, workspace.id, projectId, publication[1])); return; }
    if (publication && request.method === "POST" && publication[1] && publication[2] === "execute") { const { db, workspace } = await currentWorkspace(); uuidParam(publication[1], "publicationDraftId"); const input = objectInput(await bodyJson(request)); const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId"); json(response, 200, await executePublicationDraft(db, workspace.id, projectId, publication[1])); return; }
    if (pathname === `${BASE}/publication-drafts` && request.method === "GET") { await listPublicationDraftRecords(request, response); return; }
    const assets = pathname === `${BASE}/assets`;
    if (assets && request.method === "GET") { const { db, workspace } = await currentWorkspace(); const projectId = new URL(request.url ?? "", "http://127.0.0.1").searchParams.get("projectId"); if (projectId) uuidParam(projectId, "projectId"); const records = await db.asset.findMany({ where: { workspaceId: workspace.id, ...(projectId ? { projectId } : {}) }, orderBy: { createdAt: "desc" } }); const versions = records.length ? await db.assetVersion.findMany({ where: { workspaceId: workspace.id, assetId: { in: records.map((record) => record.id) } }, orderBy: { version: "desc" } }) : []; const latest = new Map<string, typeof versions[number]>(); for (const version of versions) if (!latest.has(version.assetId)) latest.set(version.assetId, version); json(response, 200, records.map((record) => { const version = latest.get(record.id); return { ...record, tags: version?.tags ?? [], metadata: version?.metadata, artifactId: version?.artifactId, contentUrl: version?.artifactId ? `${BASE}/artifacts/${version.artifactId}/content` : undefined }; })); return; }
    if (assets && request.method === "POST") { const { db, workspace } = await currentWorkspace(); const input = objectInput(await bodyJson(request)); const projectId = uuidParam(typeof input.projectId === "string" ? input.projectId : undefined, "projectId"); const artifactId = input.artifactId === undefined ? undefined : uuidParam(typeof input.artifactId === "string" ? input.artifactId : undefined, "artifactId"); if (artifactId) { const artifact = await db.artifact.findFirst({ where: { id: artifactId, workspaceId: workspace.id, projectId, status: "ready" } }); if (!artifact) throw new ValidationError("Artifact 不存在、未就绪或不属于当前项目"); } const asset = await db.$transaction(async (tx) => { const record = await tx.asset.create({ data: { workspaceId: workspace.id, projectId, name: requiredString(input.name, "name", 300), type: requiredString(input.type, "type", 50), usage: optionalString(input.usage, "usage", 1000) ?? "", status: "available" } }); const version = await tx.assetVersion.create({ data: { workspaceId: workspace.id, projectId, assetId: record.id, artifactId, version: 1, tags: stringArray(input.tags ?? [], "tags"), metadata: input.metadata as Prisma.InputJsonValue | undefined } }); if (artifactId) await tx.artifactLink.create({ data: { workspaceId: workspace.id, projectId, artifactId, entityType: "asset", entityId: record.id, role: "source" } }); return { ...record, tags: version.tags, metadata: version.metadata, artifactId, contentUrl: artifactId ? `${BASE}/artifacts/${artifactId}/content` : undefined }; }); json(response, 201, asset); return; }
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
