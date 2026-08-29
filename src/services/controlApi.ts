import type { AccountRecord, AccountSetupInput, AssetRecord, AutoGlmProviderStatus, AutoGlmProviderTest, ContentDraftRecord, GenerationJob, IdeaRecord, IdeaStatus, InsightRecord, ProjectAccountBinding, ProjectRecord, ProjectSetupInput, ProjectStatus, ReviewAction, RunEventRecord, RunRecord, SourcePost, SourceReviewState, TopicPreflightResult, TopicWatch, TopicWatchInput, ViralPostAnalysis } from "../types";

type ApiErrorPayload = { error?: { code?: string; message?: string } };

export class ControlApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ControlApiError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new ControlApiError("Control API 不可用，请确认 Dashboard 服务和 PostgreSQL 都已启动。", "API_UNAVAILABLE", 0);
  }
  const text = await response.text();
  let payload: unknown = undefined;
  try { payload = text ? JSON.parse(text) : undefined; } catch { /* handled as a generic API error below */ }
  if (!response.ok) {
    const error = payload as ApiErrorPayload | undefined;
    throw new ControlApiError(error?.error?.message || `Control API 请求失败 (${response.status})`, error?.error?.code || "API_ERROR", response.status);
  }
  return payload as T;
}

const json = (method: string, body: unknown, idempotencyKey?: string): RequestInit => ({ method, body: JSON.stringify(body), headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined });

export type WorkspaceSnapshot = {
  workspace: { id: string; name: string; timezone: string };
  projects: ProjectRecord[];
  topicWatches: TopicWatch[];
  accounts: AccountRecord[];
  runners: Array<Record<string, unknown>>;
  bindings: ProjectAccountBinding[];
};

export type PlatformAdapterStatus = { platform: string; id: string; label: string; configured: boolean; mode: "phone" | "http"; capabilities: Record<string, boolean>; requirements: Record<string, boolean>; extraction: { requiredFields: string[] }; detail: string };

function mapProject(project: Record<string, unknown>): ProjectRecord {
  const platforms = Array.isArray(project.platforms) ? project.platforms as ProjectRecord["platforms"] : [];
  const languages = Array.isArray(project.languages) ? project.languages as string[] : [];
  return { id: String(project.id), name: String(project.name), type: String(project.type), stage: String(project.stage), description: String(project.description || ""), targetMarkets: Array.isArray(project.targetMarkets) ? project.targetMarkets as string[] : [], languages, platforms, timezone: String(project.timezone || "UTC"), status: project.status === "archived" ? "archived" : "active", accountIds: Array.isArray(project.accountIds) ? project.accountIds as string[] : [], topics: Number(project.topics || 0), channels: Number(project.channels || platforms.length), cadence: String(project.cadence || "待配置"), locale: String(project.locale || languages.join(" / ") || "待配置"), assetCount: Number(project.assetCount || 0), promptPackVersion: typeof project.promptPackVersion === "string" ? project.promptPackVersion : undefined };
}

function mapTopic(topic: Record<string, unknown>): TopicWatch {
  return { id: String(topic.id), projectId: String(topic.projectId), name: String(topic.name), platform: topic.platform as TopicWatch["platform"], terms: Array.isArray(topic.terms) ? topic.terms as string[] : [], excludeTerms: Array.isArray(topic.excludeTerms) ? topic.excludeTerms as string[] : [], searchMode: "sequential", cadence: String(topic.cadence), state: topic.state === "paused" ? "paused" : "running", minLikes: Number(topic.minLikes || 0), minComments: Number(topic.minComments || 0), maxAgeHours: Number(topic.maxAgeHours || 24), minScore: Number(topic.minScore || 0), anomalyEnabled: topic.anomalyEnabled !== false, anomalyMethod: "robust_mad", anomalyBaselineDays: Number(topic.anomalyBaselineDays || 30), anomalyMinSamples: Number(topic.anomalyMinSamples || 30), anomalyZThreshold: Number(topic.anomalyZThreshold || 3.5), posts: Number(topic.posts || 0), qualified: Number(topic.qualified || 0), lastRun: typeof topic.lastRun === "string" ? topic.lastRun : undefined, collectorAccountBindingId: typeof topic.collectorAccountBindingId === "string" ? topic.collectorAccountBindingId : undefined };
}

function mapAccount(account: Record<string, unknown>): AccountRecord {
  return { id: String(account.id), platform: account.platform as AccountRecord["platform"], label: String(account.label), handle: String(account.handle || ""), externalUserId: typeof account.externalUserId === "string" ? account.externalUserId : undefined, displayName: typeof account.displayName === "string" ? account.displayName : undefined, avatarUrl: typeof account.avatarUrl === "string" ? account.avatarUrl : undefined, profileUrl: typeof account.profileUrl === "string" ? account.profileUrl : undefined, identityConfirmedAt: typeof account.identityConfirmedAt === "string" ? account.identityConfirmedAt : undefined, lifecycleStatus: account.lifecycleStatus === "archived" ? "archived" : "active", sharingPolicy: account.sharingPolicy === "exclusive_project" ? "exclusive_project" : "shared_workspace", connector: String(account.connector || "unconfigured"), createdAt: String(account.createdAt || ""), notes: String(account.notes || "") };
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValues(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function mapViralPostAnalysis(value: unknown): ViralPostAnalysis | undefined {
  const root = recordValue(value);
  const production = recordValue(root?.production);
  const replication = recordValue(root?.replicationDecision);
  const reasons = Array.isArray(root?.viralReasons) ? root.viralReasons : undefined;
  const candidates = Array.isArray(root?.topicCandidates) ? root.topicCandidates : undefined;
  const insights = Array.isArray(root?.insights) ? root.insights : undefined;
  const limitations = stringValues(root?.limitations);
  if (!root || typeof root.summary !== "string" || !production || !replication || !reasons || !candidates || !insights || !limitations) return undefined;
  if (!(["video", "image_text", "text"] as const).includes(production.mediaType as "video" | "image_text" | "text") || typeof production.hook !== "string") return undefined;
  const structure = stringValues(production.structure); const videoMethod = stringValues(production.videoMethod); const writingMethod = stringValues(production.writingMethod); const imageTypes = stringValues(production.imageTypes);
  const portableElements = stringValues(replication.portableElements); const mustReplace = stringValues(replication.mustReplace);
  if (!structure || !videoMethod || !writingMethod || !imageTypes || !portableElements || !mustReplace || typeof replication.reason !== "string" || !(["adapt", "inspire", "reject"] as const).includes(replication.verdict as "adapt" | "inspire" | "reject")) return undefined;
  const mappedReasons = reasons.flatMap((value) => { const item = recordValue(value); const evidence = stringValues(item?.evidence); return item && typeof item.claim === "string" && evidence && (["high", "medium", "low"] as const).includes(item.confidence as "high" | "medium" | "low") ? [{ claim: item.claim, evidence, confidence: item.confidence as "high" | "medium" | "low" }] : []; });
  if (mappedReasons.length !== reasons.length) return undefined;
  const mappedCandidates = candidates.flatMap((value) => { const item = recordValue(value); const copyOutline = stringValues(item?.copyOutline); const assetIds = stringValues(item?.assetIds); return item && typeof item.title === "string" && typeof item.hook === "string" && copyOutline && assetIds && (["视频", "图文", "纯文本"] as const).includes(item.format as "视频" | "图文" | "纯文本") && (["reuse_project_asset", "generate_style_similar", "no_asset"] as const).includes(item.assetStrategy as "reuse_project_asset" | "generate_style_similar" | "no_asset") ? [{ title: item.title, hook: item.hook, format: item.format as "视频" | "图文" | "纯文本", copyOutline, assetStrategy: item.assetStrategy as "reuse_project_asset" | "generate_style_similar" | "no_asset", assetIds, imageBrief: typeof item.imageBrief === "string" ? item.imageBrief : undefined, videoPlaceholder: typeof item.videoPlaceholder === "string" ? item.videoPlaceholder : undefined }] : []; });
  if (mappedCandidates.length !== candidates.length) return undefined;
  const mappedInsights = insights.flatMap((value) => { const item = recordValue(value); const commentIds = stringValues(item?.commentIds); return item && typeof item.title === "string" && typeof item.detail === "string" && commentIds && (["inspiration", "pain_point", "feedback"] as const).includes(item.kind as "inspiration" | "pain_point" | "feedback") && (["post", "comment", "inference"] as const).includes(item.evidenceType as "post" | "comment" | "inference") ? [{ kind: item.kind as "inspiration" | "pain_point" | "feedback", title: item.title, detail: item.detail, evidenceType: item.evidenceType as "post" | "comment" | "inference", commentIds }] : []; });
  if (mappedInsights.length !== insights.length) return undefined;
  return { summary: root.summary, viralReasons: mappedReasons, production: { mediaType: production.mediaType as "video" | "image_text" | "text", hook: production.hook, structure, videoMethod, writingMethod, imageTypes }, replicationDecision: { verdict: replication.verdict as "adapt" | "inspire" | "reject", reason: replication.reason, portableElements, mustReplace }, topicCandidates: mappedCandidates, insights: mappedInsights, limitations };
}

function mapSourcePost(post: Record<string, unknown>): SourcePost {
  const evidence = post.evidence && typeof post.evidence === "object" ? post.evidence as Record<string, unknown> : {};
  const signals = Array.isArray(evidence.signals) ? evidence.signals.filter((item): item is string => typeof item === "string") : [];
  const scoreBreakdown = Array.isArray(evidence.scoreBreakdown) ? evidence.scoreBreakdown.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).label === "string" && typeof (item as Record<string, unknown>).value === "string" ? [{ label: (item as Record<string, unknown>).label as string, value: (item as Record<string, unknown>).value as string }] : []) : [];
  const patternCard = mapViralPostAnalysis(post.patternCard);
  return { id: String(post.id), platform: post.platform as SourcePost["platform"], author: String(post.author || ""), title: String(post.title || ""), topic: String(post.topic || ""), published: String(post.publishedAt || post.published || "待确认"), likes: Number(post.likes || 0), comments: Number(post.comments || 0), score: Number(post.score || 0), reason: String(post.reason || "未匹配话题规则"), mediaType: (post.mediaType || "文本") as SourcePost["mediaType"], image: String(post.image || ""), action: (post.action || "unreviewed") as ReviewAction, reviewState: (post.reviewState || "pending") as SourceReviewState, canonicalUrl: String(post.canonicalUrl || ""), externalId: String(post.externalId || ""), capturedAt: String(post.capturedAt || ""), patternCard, patternCardVersion: typeof post.patternCardVersion === "number" ? post.patternCardVersion : undefined, evidence: { signals, scoreBreakdown, capturedBy: String(evidence.capturedBy || post.capturedBy || "control-api"), capturedAt: String(evidence.capturedAt || post.capturedAt || "") } };
}

function mapIdea(idea: Record<string, unknown>): IdeaRecord {
  return { id: String(idea.id), title: String(idea.title), hook: String(idea.hook || ""), format: (idea.format || "纯文本") as IdeaRecord["format"], source: String(idea.source || ""), sourcePostIds: Array.isArray(idea.sourcePostIds) ? idea.sourcePostIds as string[] : [], platforms: Array.isArray(idea.platforms) ? idea.platforms as IdeaRecord["platforms"] : [], status: (idea.status || "candidate") as IdeaStatus, videoPrompt: typeof idea.videoPrompt === "string" ? idea.videoPrompt : undefined, videoBrief: idea.videoBrief && typeof idea.videoBrief === "object" && !Array.isArray(idea.videoBrief) ? idea.videoBrief as Record<string, unknown> : undefined, imageBrief: typeof idea.imageBrief === "string" ? idea.imageBrief : undefined, assetMatch: idea.assetMatch as IdeaRecord["assetMatch"], assetId: typeof idea.assetId === "string" ? idea.assetId : undefined, assetIds: Array.isArray(idea.assetIds) ? idea.assetIds.filter((item): item is string => typeof item === "string") : [], copy: typeof idea.copy === "string" ? idea.copy : undefined, generationBatchId: typeof idea.generationBatchId === "string" ? idea.generationBatchId : undefined, updatedAt: typeof idea.updatedAt === "string" ? idea.updatedAt : undefined };
}

function mapGenerationRun(run: Record<string, unknown>): GenerationJob { const input = run.inputSnapshot && typeof run.inputSnapshot === "object" && !Array.isArray(run.inputSnapshot) ? run.inputSnapshot as Record<string, unknown> : {}; const status = run.status === "running" ? "running" : run.status === "waiting_review" ? "review" : run.status === "completed" ? "ready" : run.status === "failed" ? "failed" : "queued"; return { id: String(run.id), title: typeof input.title === "string" ? input.title : typeof run.title === "string" ? run.title : `待审草稿 ${String(run.id).slice(0, 8)}`, type: input.format === "图文" ? "图文" : "视频", provider: String(run.provider || "unconfigured"), progress: status === "ready" ? 100 : status === "running" ? 50 : 0, status, updated: String(run.updatedAt || run.createdAt || ""), ideaId: typeof run.ideaId === "string" ? run.ideaId : undefined, prompt: typeof input.prompt === "string" ? input.prompt : undefined, copy: typeof input.copy === "string" ? input.copy : undefined, artifacts: [] }; }
function mapInsight(insight: Record<string, unknown>): InsightRecord { return { id: String(insight.id), projectId: String(insight.projectId), sourcePostId: typeof insight.sourcePostId === "string" ? insight.sourcePostId : undefined, ideaId: typeof insight.ideaId === "string" ? insight.ideaId : undefined, kind: insight.kind as InsightRecord["kind"], title: String(insight.title || ""), detail: String(insight.detail || ""), evidenceType: insight.evidenceType as InsightRecord["evidenceType"], commentIds: Array.isArray(insight.commentIds) ? insight.commentIds.filter((item): item is string => typeof item === "string") : [], status: (insight.status || "pending") as InsightRecord["status"], createdBy: typeof insight.createdBy === "string" ? insight.createdBy : undefined, createdAt: String(insight.createdAt || ""), updatedAt: String(insight.updatedAt || "") }; }
function mapContentDraft(draft: Record<string, unknown>): ContentDraftRecord { const revision = draft.revision && typeof draft.revision === "object" && !Array.isArray(draft.revision) ? draft.revision as Record<string, unknown> : {}; const snapshot = revision.sourceSnapshot && typeof revision.sourceSnapshot === "object" && !Array.isArray(revision.sourceSnapshot) ? revision.sourceSnapshot as ContentDraftRecord["revision"]["sourceSnapshot"] : { idea: { id: String(draft.ideaId), title: "", version: 0 }, sourcePosts: [], analyses: [] }; return { id: String(draft.id), projectId: String(draft.projectId), ideaId: String(draft.ideaId), status: (draft.status || "pending_review") as ContentDraftRecord["status"], currentVersion: Number(draft.currentVersion || revision.version || 1), createdAt: String(draft.createdAt || ""), updatedAt: String(draft.updatedAt || ""), revision: { id: String(revision.id || ""), version: Number(revision.version || 1), title: String(revision.title || ""), copy: String(revision.copy || ""), format: String(revision.format || "纯文本"), assetStrategy: String(revision.assetStrategy || "pending"), assetIds: Array.isArray(revision.assetIds) ? revision.assetIds.filter((item): item is string => typeof item === "string") : [], imageBrief: typeof revision.imageBrief === "string" ? revision.imageBrief : undefined, videoBrief: revision.videoBrief && typeof revision.videoBrief === "object" && !Array.isArray(revision.videoBrief) ? revision.videoBrief as Record<string, unknown> : undefined, sourceSnapshot: snapshot, createdBy: typeof revision.createdBy === "string" ? revision.createdBy : undefined, createdAt: String(revision.createdAt || "") } }; }
function mapRun(run: Record<string, unknown>): RunRecord { const status = run.status === "running" ? "running" : run.status === "completed" ? "completed" : run.status === "waiting_review" ? "waiting_review" : "failed"; const knownKinds = new Set<RunRecord["kind"]>(["抓取", "视频分析", "Idea 生成", "生成", "发布"]); const rawKind = String(run.kind || "生成"); const events = Array.isArray(run.events) ? run.events.map((event) => { const item = event as Record<string, unknown>; return { id: String(item.id), level: item.level === "error" ? "error" : item.level === "warn" ? "warn" : "info", eventType: String(item.eventType || "event"), message: String(item.message || ""), payload: item.payload && typeof item.payload === "object" ? item.payload as Record<string, unknown> : undefined, createdAt: String(item.createdAt || "") } satisfies RunEventRecord; }) : undefined; return { id: String(run.id), kind: knownKinds.has(rawKind as RunRecord["kind"]) ? rawKind as RunRecord["kind"] : "生成", status, provider: String(run.provider || "unconfigured"), startedAt: String(run.startedAt || run.createdAt || ""), completedAt: typeof run.completedAt === "string" ? run.completedAt : undefined, inputCount: Number(run.inputCount || 0), outputCount: Number(run.outputCount || 0), note: String(run.note || run.errorMessage || ""), events }; }
function mapAsset(asset: Record<string, unknown>): AssetRecord { return { id: String(asset.id), projectId: String(asset.projectId), name: String(asset.name), type: (asset.type || "其他") as AssetRecord["type"], image: typeof asset.contentUrl === "string" ? asset.contentUrl : "", tags: Array.isArray(asset.tags) ? asset.tags.map(String) : [], usage: String(asset.usage || ""), status: asset.status === "available" ? "可用" : "待标注", artifactId: typeof asset.artifactId === "string" ? asset.artifactId : undefined }; }

export const controlApi = {
  async health() { return request<{ status: string }>("/health"); },
  platforms() { return request<PlatformAdapterStatus[]>("/platforms"); },
  autoGlmProvider() { return request<AutoGlmProviderStatus>("/providers/autoglm"); },
  testAutoGlmProvider() { return request<AutoGlmProviderTest>("/providers/autoglm/test", json("POST", {})); },
  migrateDemoWorkspace(snapshot: unknown) { return request<{ migrated: boolean }>("/migrations/demo-workspace", json("POST", snapshot, "demo-workspace.v1")); },
  recordIdentityConflict(id: string, identity: { externalUserId?: string; handle: string; displayName: string; avatarUrl?: string; profileUrl: string; detectedAt: string }) { return request(`/accounts/${id}/identity-checks`, json("POST", { ...identity, status: "identity_mismatch" })); },
  async workspace(): Promise<WorkspaceSnapshot> { const snapshot = await request<Record<string, unknown>>("/workspace"); return { workspace: snapshot.workspace as WorkspaceSnapshot["workspace"], projects: (snapshot.projects as Record<string, unknown>[]).map(mapProject), topicWatches: (snapshot.topicWatches as Record<string, unknown>[]).map(mapTopic), accounts: (snapshot.accounts as Record<string, unknown>[]).map(mapAccount), runners: snapshot.runners as Array<Record<string, unknown>>, bindings: snapshot.bindings as ProjectAccountBinding[] }; },
  createProject(input: ProjectSetupInput) { return request<ProjectRecord>("/projects", json("POST", { ...input.project, trackingRules: input.trackingRules }, crypto.randomUUID())); },
  patchProject(id: string, input: Partial<ProjectSetupInput["project"]>) { return request<ProjectRecord>(`/projects/${id}`, json("PATCH", input)); },
  archiveProject(id: string, status: ProjectStatus) { return request<ProjectRecord>(`/projects/${id}/${status === "archived" ? "archive" : "restore"}`, json("POST", {})); },
  createTopic(projectId: string, input: TopicWatchInput) { return request<TopicWatch>(`/projects/${projectId}/topic-watches`, json("POST", input, crypto.randomUUID())); },
  patchTopic(id: string, input: Partial<TopicWatch>) { return request<TopicWatch>(`/topic-watches/${id}`, json("PATCH", input)); },
  preflightTopic(id: string) { return request<TopicPreflightResult>(`/topic-watches/${id}/preflight`, json("POST", {})); },
  runTopic(id: string) { return request<{ ok: boolean; preflight: TopicPreflightResult; run: { id: string; collectionRunId: string; status: string; errorCode: string; errorMessage: string; traceId: string } }>(`/topic-watches/${id}/runs`, json("POST", {}, crypto.randomUUID())); },
  createAccountBinding(projectId: string, input: { accountId: string; roles: string[]; isPrimaryDiscovery: boolean; isPrimaryPublishing: boolean }) { return request<ProjectAccountBinding>(`/projects/${projectId}/account-bindings`, json("POST", input, crypto.randomUUID())); },
  createAccount(input: AccountSetupInput) { return request<Record<string, unknown>>("/accounts", json("POST", input, crypto.randomUUID())).then(mapAccount); },
  patchAccount(id: string, input: AccountSetupInput) { return request<Record<string, unknown>>(`/accounts/${id}`, json("PATCH", input)).then(mapAccount); },
  archiveAccount(id: string, status: "active" | "archived") { return request<Record<string, unknown>>(`/accounts/${id}/${status === "archived" ? "archive" : "restore"}`, json("POST", {})).then(mapAccount); },
  saveIdentityCheck(id: string, identity: { externalUserId?: string; handle: string; displayName: string; avatarUrl?: string; profileUrl: string; detectedAt: string }, status = "confirmed") { return request(`/accounts/${id}/identity-checks`, json("POST", { ...identity, status })); },
  listSourcePosts(projectId: string) { return request<Record<string, unknown>[]>(`/source-posts?projectId=${encodeURIComponent(projectId)}`).then((items) => items.map(mapSourcePost)); },
  sourceAnalysisContext(id: string) { return request<Record<string, unknown>>(`/source-posts/${id}/analysis-context`); },
  saveSourceAnalysis(id: string, analysis: ViralPostAnalysis) { return request<Record<string, unknown>>(`/source-posts/${id}/analysis`, json("PUT", { analysis, provider: "codex-skill", promptVersion: "viral-topic-analysis/v1" })); },
  collectSourceComments(projectId: string, id: string, accountId: string, limit = 100) { return request<Record<string, unknown>>(`/source-posts/${id}/comment-runs`, json("POST", { projectId, accountId, limit }, crypto.randomUUID())); },
  reviewSourcePosts(projectId: string, ids: string[], status: SourceReviewState, reason?: string) { return request(`/source-posts/reviews`, json("POST", { projectId, ids, status, reason })); },
  listIdeas(projectId: string) { return request<Record<string, unknown>[]>(`/ideas?projectId=${encodeURIComponent(projectId)}`).then((items) => items.map(mapIdea)); },
  createIdeas(projectId: string, input: Record<string, unknown>) { return request<Record<string, unknown>[]>("/ideas", json("POST", { projectId, ...input }, crypto.randomUUID())).then((items) => items.map(mapIdea)); },
  patchIdea(projectId: string, id: string, patch: Partial<IdeaRecord>) { return request<Record<string, unknown>>(`/ideas/${id}`, json("PATCH", { projectId, ...patch })).then(mapIdea); },
  reviewIdeas(projectId: string, ids: string[], status: IdeaStatus, reason?: string) { return request(`/ideas/reviews`, json("POST", { projectId, ids, status, reason })); },
  listInsights(projectId: string) { return request<Record<string, unknown>[]>(`/insights?projectId=${encodeURIComponent(projectId)}`).then((items) => items.map(mapInsight)); },
  createInsight(input: Omit<InsightRecord, "id" | "createdAt" | "updatedAt">) { return request<Record<string, unknown>>("/insights", json("POST", input, crypto.randomUUID())).then(mapInsight); },
  patchInsight(projectId: string, id: string, patch: Partial<InsightRecord>) { return request<Record<string, unknown>>(`/insights/${id}`, json("PATCH", { projectId, ...patch })).then(mapInsight); },
  listContentDrafts(projectId: string) { return request<Record<string, unknown>[]>(`/content-drafts?projectId=${encodeURIComponent(projectId)}`).then((items) => items.map(mapContentDraft)); },
  createContentDraft(input: Record<string, unknown>) { return request<Record<string, unknown>>("/content-drafts", json("POST", input, crypto.randomUUID())).then(mapContentDraft); },
  patchContentDraft(projectId: string, id: string, patch: Record<string, unknown>) { return request<Record<string, unknown>>(`/content-drafts/${id}`, json("PATCH", { projectId, ...patch })).then(mapContentDraft); },
  reviewContentDraft(projectId: string, id: string, status: ContentDraftRecord["status"], reason?: string) { return request<Record<string, unknown>>(`/content-drafts/${id}/review`, json("POST", { projectId, status, reason })).then(mapContentDraft); },
  listGenerationRuns(projectId: string) { return request<Record<string, unknown>[]>(`/generation-runs?projectId=${encodeURIComponent(projectId)}`).then((items) => items.map(mapGenerationRun)); },
  createGenerationRun(input: Record<string, unknown>) { return request<Record<string, unknown>>("/generation-runs", json("POST", input, crypto.randomUUID())).then(mapGenerationRun); },
  patchGenerationRun(id: string, input: Record<string, unknown>) { return request<Record<string, unknown>>(`/generation-runs/${id}`, json("PATCH", input)).then(mapGenerationRun); },
  listPublicationDrafts(projectId?: string) { return request<Record<string, unknown>[]>(`/publication-drafts${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`); },
  createPublicationDraft(input: Record<string, unknown>) { return request<Record<string, unknown>>("/publication-drafts", json("POST", input, crypto.randomUUID())); },
  approvePublicationDraft(projectId: string, id: string) { return request<Record<string, unknown>>(`/publication-drafts/${id}/approve`, json("POST", { projectId })); },
  executePublicationDraft(projectId: string, id: string) { return request<Record<string, unknown>>(`/publication-drafts/${id}/execute`, json("POST", { projectId })); },
  listRuns() { return request<Record<string, unknown>[]>("/runs").then((items) => items.map(mapRun)); },
  getRun(id: string) { return request<Record<string, unknown>>(`/runs/${id}`).then(mapRun); },
  listAssets(projectId: string) { return request<Record<string, unknown>[]>(`/assets?projectId=${encodeURIComponent(projectId)}`).then((items) => items.map(mapAsset)); },
  createAsset(input: { projectId: string; name: string; type: string; usage?: string; tags: string[]; artifactId?: string; metadata?: Record<string, unknown> }) { return request<Record<string, unknown>>("/assets", json("POST", input)).then(mapAsset); },
};
