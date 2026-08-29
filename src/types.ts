export type KnownPlatform = "TikTok" | "小红书" | "Reddit" | "X" | "抖音" | "Instagram";
/** Extensible platform identifier; adapters may register additional platforms. */
export type Platform = KnownPlatform | (string & {});
export type MediaType = "视频" | "图文" | "文本";
export type IdeaFormat = "视频" | "图文" | "评论" | "纯文本";
export type ReviewAction = "unreviewed" | "engage" | "adapt" | "ignored";
export type SourceReviewState = "pending" | "approved" | "rejected";
export type IdeaStatus = "candidate" | "approved" | "rejected";
export type AssetMatchState = "pending" | "matched" | "needs_generation" | "not_applicable";
export type ProjectStatus = "active" | "archived";
export type AccountRole = "discovery" | "publishing" | "engagement";
export type AccountSessionStatus = "login_required" | "verifying" | "healthy" | "needs_reauth" | "challenged" | "identity_mismatch";
export type AccountLifecycleStatus = "active" | "archived";
export type AccountSharingPolicy = "exclusive_project" | "shared_workspace";
export type TopicSearchMode = "sequential";
export type AnomalyMethod = "robust_mad";

export interface ProjectRecord {
  id: string;
  name: string;
  type: string;
  stage: string;
  description: string;
  targetMarkets: string[];
  languages: string[];
  platforms: Platform[];
  timezone: string;
  status: ProjectStatus;
  accountIds: string[];
  topics: number;
  channels: number;
  cadence: string;
  locale: string;
  assetCount?: number;
  promptPackVersion?: string;
}

export interface TopicWatch {
  id: string;
  projectId: string;
  name: string;
  platform: Platform;
  terms: string[];
  excludeTerms: string[];
  searchMode: TopicSearchMode;
  cadence: string;
  state: "running" | "paused";
  minLikes: number;
  minComments: number;
  maxAgeHours: number;
  minScore: number;
  anomalyEnabled: boolean;
  anomalyMethod: AnomalyMethod;
  anomalyBaselineDays: number;
  anomalyMinSamples: number;
  anomalyZThreshold: number;
  posts: number;
  qualified: number;
  lastRun?: string;
  collectorAccountBindingId?: string;
}

export interface TopicWatchInput {
  id?: string;
  name: string;
  platform: Platform;
  terms: string[];
  excludeTerms: string[];
  searchMode: TopicSearchMode;
  cadence: string;
  state: "running" | "paused";
  minLikes: number;
  minComments: number;
  maxAgeHours: number;
  minScore: number;
  anomalyEnabled: boolean;
  anomalyMethod: AnomalyMethod;
  anomalyBaselineDays: number;
  anomalyMinSamples: number;
  anomalyZThreshold: number;
  collectorAccountBindingId?: string;
}

export interface AutoGlmProviderStatus {
  id: "zhipu-autoglm-phone";
  label: string;
  configured: boolean;
  baseUrl: string;
  model: string;
  credentialSource?: string;
  pricing: "limited_free";
}

export interface AutoGlmProviderTest extends AutoGlmProviderStatus {
  ok: boolean;
  latencyMs?: number;
  requestId?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  message: string;
}

export interface TopicPreflightCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface TopicPreflightResult {
  ready: boolean;
  checks: TopicPreflightCheck[];
}

export interface ProjectSetupInput {
  project: Pick<ProjectRecord, "name" | "type" | "stage" | "description" | "targetMarkets" | "languages" | "platforms" | "timezone" | "promptPackVersion" | "accountIds">;
  trackingRules: TopicWatchInput[];
}

export interface SourceEvidence {
  signals: string[];
  scoreBreakdown: { label: string; value: string }[];
  capturedBy: string;
  capturedAt: string;
}

export interface PatternCard {
  hook: string;
  hookSeconds?: number;
  structure: string;
  shotRhythm: string;
  onScreenText: string;
  proofPoint: string;
  cta: string;
  replaceableElements: string[];
}

export interface SourcePost {
  id: string;
  platform: Platform;
  author: string;
  title: string;
  topic: string;
  published: string;
  likes: number;
  comments: number;
  score: number;
  reason: string;
  mediaType: MediaType;
  image: string;
  action: ReviewAction;
  reviewState: SourceReviewState;
  canonicalUrl: string;
  externalId: string;
  capturedAt: string;
  evidence: SourceEvidence;
  patternCard?: PatternCard;
}

export interface AssetRecord {
  id: string;
  projectId: string;
  name: string;
  type: "截图" | "录屏" | "Logo" | "音频" | "其他";
  image: string;
  tags: string[];
  usage: string;
  status: "可用" | "待标注";
}

export interface IdeaRecord {
  id: string;
  title: string;
  hook: string;
  format: IdeaFormat;
  source: string;
  sourcePostIds?: string[];
  platforms: Platform[];
  status: IdeaStatus;
  videoPrompt?: string;
  assetMatch?: AssetMatchState;
  assetId?: string;
  copy?: string;
  generationBatchId?: string;
  updatedAt?: string;
}

export interface ArtifactRecord {
  id: string;
  kind: "text" | "image" | "video";
  label: string;
  provider: string;
  status: "ready" | "review" | "failed";
  version: string;
}

export interface GenerationJob {
  id: string;
  title: string;
  type: "视频" | "图文";
  provider: string;
  progress: number;
  status: "running" | "review" | "ready" | "queued";
  updated: string;
  ideaId?: string;
  artifacts?: ArtifactRecord[];
  prompt?: string;
  copy?: string;
}

export interface AccountRecord {
  id: string;
  platform: Platform;
  label: string;
  handle: string;
  externalUserId?: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
  identityConfirmedAt?: string;
  lifecycleStatus: AccountLifecycleStatus;
  sharingPolicy: AccountSharingPolicy;
  connector: string;
  createdAt: string;
  notes: string;
}

export interface AutomationProfileRecord {
  id: string;
  accountId: string;
  runnerType: "chrome_cdp" | "playwright" | "appium_xcuitest" | "appium_uiautomator2";
  profileName: string;
  profileRef: string;
  browserEnvironmentId?: string;
  deviceId?: string;
  deviceModel?: string;
  appPackage?: string;
  sessionStatus: AccountSessionStatus;
  lockState: "available" | "busy";
  lastVerifiedAt?: string;
  lastHealthCheck?: string;
}

export interface ProjectAccountBinding {
  id: string;
  projectId: string;
  accountId: string;
  roles: AccountRole[];
  isPrimaryDiscovery: boolean;
  isPrimaryPublishing: boolean;
}

export interface ProjectAccountBindingInput {
  id?: string;
  projectId: string;
  roles: AccountRole[];
  isPrimaryDiscovery: boolean;
  isPrimaryPublishing: boolean;
}

export interface AccountSetupInput {
  account: Pick<AccountRecord, "platform" | "label" | "notes">;
  profile: Pick<AutomationProfileRecord, "runnerType" | "profileName" | "browserEnvironmentId" | "deviceId" | "deviceModel" | "appPackage">;
}

export interface AccountIdentityInput {
  externalUserId?: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  profileUrl: string;
  detectedAt: string;
}

export interface RunRecord {
  id: string;
  kind: "抓取" | "视频分析" | "Idea 生成" | "生成" | "发布";
  status: "running" | "completed" | "failed" | "waiting_review";
  provider: string;
  startedAt: string;
  completedAt?: string;
  inputCount: number;
  outputCount: number;
  note: string;
  events?: RunEventRecord[];
}

export interface RunEventRecord {
  id: string;
  level: "info" | "warn" | "error";
  eventType: string;
  message: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}
