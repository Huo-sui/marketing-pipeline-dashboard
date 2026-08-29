import type { AccountRecord, AccountSetupInput, AssetRecord, AutoGlmProviderStatus, AutoGlmProviderTest, GenerationJob, IdeaRecord, IdeaStatus, ProjectAccountBinding, ProjectRecord, ProjectSetupInput, ProjectStatus, ReviewAction, RunEventRecord, RunRecord, SourcePost, SourceReviewState, TopicPreflightResult, TopicWatch, TopicWatchInput } from "../types";

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

function mapSourcePost(post: Record<string, unknown>): SourcePost {
  const evidence = post.evidence && typeof post.evidence === "object" ? post.evidence as Record<string, unknown> : {};
  const signals = Array.isArray(evidence.signals) ? evidence.signals.filter((item): item is string => typeof item === "string") : [];
  const scoreBreakdown = Array.isArray(evidence.scoreBreakdown) ? evidence.scoreBreakdown.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).label === "string" && typeof (item as Record<string, unknown>).value === "string" ? [{ label: (item as Record<string, unknown>).label as string, value: (item as Record<string, unknown>).value as string }] : []) : [];
  return { id: String(post.id), platform: post.platform as SourcePost["platform"], author: String(post.author || ""), title: String(post.title || ""), topic: String(post.topic || ""), published: String(post.publishedAt || post.published || "待确认"), likes: Number(post.likes || 0), comments: Number(post.comments || 0), score: Number(post.score || 0), reason: String(post.reason || "未匹配话题规则"), mediaType: (post.mediaType || "文本") as SourcePost["mediaType"], image: String(post.image || ""), action: (post.action || "unreviewed") as ReviewAction, reviewState: (post.reviewState || "pending") as SourceReviewState, canonicalUrl: String(post.canonicalUrl || ""), externalId: String(post.externalId || ""), capturedAt: String(post.capturedAt || ""), evidence: { signals, scoreBreakdown, capturedBy: String(evidence.capturedBy || post.capturedBy || "control-api"), capturedAt: String(evidence.capturedAt || post.capturedAt || "") } };
}

function mapIdea(idea: Record<string, unknown>): IdeaRecord {
  return { id: String(idea.id), title: String(idea.title), hook: String(idea.hook || ""), format: (idea.format || "纯文本") as IdeaRecord["format"], source: String(idea.source || ""), sourcePostIds: Array.isArray(idea.sourcePostIds) ? idea.sourcePostIds as string[] : [], platforms: Array.isArray(idea.platforms) ? idea.platforms as IdeaRecord["platforms"] : [], status: (idea.status || "candidate") as IdeaStatus, videoPrompt: typeof idea.videoPrompt === "string" ? idea.videoPrompt : undefined, assetMatch: idea.assetMatch as IdeaRecord["assetMatch"], assetId: typeof idea.assetId === "string" ? idea.assetId : undefined, copy: typeof idea.copy === "string" ? idea.copy : undefined, generationBatchId: typeof idea.generationBatchId === "string" ? idea.generationBatchId : undefined, updatedAt: typeof idea.updatedAt === "string" ? idea.updatedAt : undefined };
}

function mapGenerationRun(run: Record<string, unknown>): GenerationJob { const status = run.status === "running" ? "running" : run.status === "waiting_review" ? "review" : run.status === "completed" ? "ready" : "queued"; return { id: String(run.id), title: typeof run.title === "string" ? run.title : `生成任务 ${String(run.id).slice(0, 8)}`, type: "视频", provider: String(run.provider || "unconfigured"), progress: status === "ready" ? 100 : status === "running" ? 50 : 0, status, updated: String(run.updatedAt || run.createdAt || ""), ideaId: typeof run.ideaId === "string" ? run.ideaId : undefined, prompt: typeof run.prompt === "string" ? run.prompt : undefined, copy: typeof run.copy === "string" ? run.copy : undefined, artifacts: [] }; }
function mapRun(run: Record<string, unknown>): RunRecord { const status = run.status === "running" ? "running" : run.status === "completed" ? "completed" : run.status === "waiting_review" ? "waiting_review" : "failed"; const knownKinds = new Set<RunRecord["kind"]>(["抓取", "视频分析", "Idea 生成", "生成", "发布"]); const rawKind = String(run.kind || "生成"); const events = Array.isArray(run.events) ? run.events.map((event) => { const item = event as Record<string, unknown>; return { id: String(item.id), level: item.level === "error" ? "error" : item.level === "warn" ? "warn" : "info", eventType: String(item.eventType || "event"), message: String(item.message || ""), payload: item.payload && typeof item.payload === "object" ? item.payload as Record<string, unknown> : undefined, createdAt: String(item.createdAt || "") } satisfies RunEventRecord; }) : undefined; return { id: String(run.id), kind: knownKinds.has(rawKind as RunRecord["kind"]) ? rawKind as RunRecord["kind"] : "生成", status, provider: String(run.provider || "unconfigured"), startedAt: String(run.startedAt || run.createdAt || ""), completedAt: typeof run.completedAt === "string" ? run.completedAt : undefined, inputCount: Number(run.inputCount || 0), outputCount: Number(run.outputCount || 0), note: String(run.note || run.errorMessage || ""), events }; }
function mapAsset(asset: Record<string, unknown>): AssetRecord { return { id: String(asset.id), projectId: String(asset.projectId), name: String(asset.name), type: (asset.type || "其他") as AssetRecord["type"], image: "", tags: [], usage: String(asset.usage || ""), status: asset.status === "available" ? "可用" : "待标注" }; }

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
  reviewSourcePosts(ids: string[], status: SourceReviewState, reason?: string) { return request(`/source-posts/reviews`, json("POST", { ids, status, reason })); },
  listIdeas(projectId: string) { return request<Record<string, unknown>[]>(`/ideas?projectId=${encodeURIComponent(projectId)}`).then((items) => items.map(mapIdea)); },
  createIdeas(projectId: string, input: Record<string, unknown>) { return request<Record<string, unknown>[]>("/ideas", json("POST", { projectId, ...input }, crypto.randomUUID())).then((items) => items.map(mapIdea)); },
  patchIdea(id: string, patch: Partial<IdeaRecord>) { return request<Record<string, unknown>>(`/ideas/${id}`, json("PATCH", patch)).then(mapIdea); },
  reviewIdeas(ids: string[], status: IdeaStatus, reason?: string) { return request(`/ideas/reviews`, json("POST", { ids, status, reason })); },
  listGenerationRuns(projectId: string) { return request<Record<string, unknown>[]>(`/generation-runs?projectId=${encodeURIComponent(projectId)}`).then((items) => items.map(mapGenerationRun)); },
  createGenerationRun(input: Record<string, unknown>) { return request<Record<string, unknown>>("/generation-runs", json("POST", input, crypto.randomUUID())).then(mapGenerationRun); },
  patchGenerationRun(id: string, input: Record<string, unknown>) { return request<Record<string, unknown>>(`/generation-runs/${id}`, json("PATCH", input)).then(mapGenerationRun); },
  listPublicationDrafts() { return request<Record<string, unknown>[]>("/publication-drafts"); },
  createPublicationDraft(input: Record<string, unknown>) { return request<Record<string, unknown>>("/publication-drafts", json("POST", input, crypto.randomUUID())); },
  approvePublicationDraft(id: string) { return request<Record<string, unknown>>(`/publication-drafts/${id}/approve`, json("POST", {})); },
  executePublicationDraft(id: string) { return request<Record<string, unknown>>(`/publication-drafts/${id}/execute`, json("POST", {})); },
  listRuns() { return request<Record<string, unknown>[]>("/runs").then((items) => items.map(mapRun)); },
  getRun(id: string) { return request<Record<string, unknown>>(`/runs/${id}`).then(mapRun); },
  listAssets(projectId: string) { return request<Record<string, unknown>[]>(`/assets?projectId=${encodeURIComponent(projectId)}`).then((items) => items.map(mapAsset)); },
  createAsset(input: { projectId: string; name: string; type: string; usage?: string; tags: string[] }) { return request<Record<string, unknown>>("/assets", json("POST", input)).then(mapAsset); },
};
