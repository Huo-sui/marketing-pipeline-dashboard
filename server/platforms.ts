/**
 * Platform capability contracts.
 *
 * Platform-specific details belong behind this registry.  The control plane
 * only deals with normalized discovery records and account capabilities, so a
 * new platform can be connected through an HTTP/API adapter without changing
 * the workflow or database shape.
 */
import type { TikTokDiscoveryResult } from "./tiktokAccountWorker.js";
import { discoverTikTok } from "./tiktokAccountWorker.js";
import { captureXiaohongshuCover, discoverXiaohongshu } from "./platforms/xiaohongshuPhoneAdapter.js";
import { xiaohongshuPublisherConfigurationState } from "./platforms/xiaohongshuPublisher.js";
import { normalizeLoopbackServiceBaseUrl } from "./platforms/loopbackServiceUrl.js";
import type { DiscoveryMediaTypeFilter, PlatformDiscoveryRequest } from "./mobile/discoveryStateMachine.js";
import { httpDiscoveryPayload } from "./platforms/discoveryPolicy.js";
import { isUsableXiaohongshuAccessUrl, xiaohongshuExternalId } from "./platforms/xiaohongshuUrl.js";
import { discoverXiaohongshuViaMcp, xiaohongshuMcpConfigurationState } from "./platforms/xiaohongshuMcpAdapter.js";
import type { DiscoveryFallbackReason } from "./platforms/discoveryFallback.js";

export type { DiscoveryMediaTypeFilter, PlatformDiscoveryRequest } from "./mobile/discoveryStateMachine.js";

export type PlatformAdapterRequirements = {
  accountBinding: boolean;
  confirmedIdentity: boolean;
  phoneRunner: boolean;
  visualProvider: boolean;
};

export type PlatformDiscoveryRequiredField = "externalId" | "canonicalUrl" | "author" | "title" | "body" | "likes" | "comments" | "publishedAt" | "mediaType" | "term" | "rawPayload" | "coverEvidence";

export type PlatformCoverEvidence = {
  bytes: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  capturedAt: string;
  source: "device_screenshot" | "platform_api";
};

export type PlatformAdapterStatus = {
  platform: string;
  id: string;
  label: string;
  configured: boolean;
  mode: "phone" | "http";
  capabilities: { phoneControl: boolean; identity: boolean; discovery: boolean; commentCollection: boolean; publishing: boolean; engagement: boolean };
  requirements: PlatformAdapterRequirements;
  commentCollection?: { requirements: Pick<PlatformAdapterRequirements, "accountBinding" | "confirmedIdentity" | "phoneRunner"> };
  extraction: { requiredFields: PlatformDiscoveryRequiredField[] };
  discovery: { mediaTypes: DiscoveryMediaTypeFilter[]; stateMachineVersion: string; defaultCandidateLimit: 3 };
  detail: string;
};

export type PlatformDiscoveryPost = {
  externalId: string;
  canonicalUrl: string;
  author: string;
  title: string;
  body?: string;
  likes: number;
  comments: number;
  publishedAt: string;
  mediaType: "视频" | "图文" | "文本";
  term: string;
  rawPayload: Record<string, unknown>;
  coverEvidence: PlatformCoverEvidence;
};
export type PlatformDiscoveryLog = TikTokDiscoveryResult["logs"][number];
export type PlatformDiscoveryResult = { posts: PlatformDiscoveryPost[]; logs: PlatformDiscoveryLog[] };
export type PlatformComment = { externalId?: string; author?: string; body: string; likes?: number; publishedAt?: string };
export type PlatformCommentCollectionResult = { comments: PlatformComment[]; logs: PlatformDiscoveryLog[] };
export type PlatformSourceLinkStatus = { usable: boolean; reason?: string };

export type PlatformAdapter = {
  id: string;
  platform: string;
  label: string;
  status: () => PlatformAdapterStatus;
  discover: (request: PlatformDiscoveryRequest) => Promise<PlatformDiscoveryResult>;
  discoveryFallback?: {
    enabled: () => boolean;
    discover: (request: PlatformDiscoveryRequest, reason: DiscoveryFallbackReason) => Promise<PlatformDiscoveryResult>;
  };
  captureCover?: (accountId: string, post: Pick<PlatformDiscoveryPost, "externalId" | "canonicalUrl" | "author" | "title">, deviceId?: string) => Promise<PlatformCoverEvidence>;
  collectComments?: (accountId: string, post: Pick<PlatformDiscoveryPost, "externalId" | "canonicalUrl">, limit: number, deviceId?: string) => Promise<PlatformCommentCollectionResult>;
  sourceLinkStatus?: (post: Pick<PlatformDiscoveryPost, "externalId" | "canonicalUrl">) => PlatformSourceLinkStatus;
};

function emptyResult(): PlatformDiscoveryResult {
  return { posts: [], logs: [] };
}

/** Generic HTTP discovery adapter used by API-backed platforms such as 小红书. */
function createHttpAdapter(platform: string, label: string, envName: string): PlatformAdapter {
  const keyEnvName = envName.replace(/_BASE_URL$/, "_KEY");
  return {
    id: `${platform.toLowerCase()}-http`,
    platform,
    label,
    status: () => {
      const baseUrl = process.env[envName]?.trim();
      return {
        platform,
        id: `${platform.toLowerCase()}-http`,
        label,
        configured: Boolean(baseUrl),
        mode: "http",
        capabilities: { phoneControl: false, identity: false, discovery: Boolean(baseUrl), commentCollection: false, publishing: false, engagement: false },
        requirements: { accountBinding: false, confirmedIdentity: false, phoneRunner: false, visualProvider: false },
        extraction: { requiredFields: ["externalId", "canonicalUrl", "author", "title", "likes", "comments", "publishedAt", "mediaType", "term", "rawPayload", "coverEvidence"] },
        discovery: { mediaTypes: ["any", "video", "image_text"], stateMachineVersion: "http-pass-through-v1", defaultCandidateLimit: 3 },
        detail: baseUrl ? `HTTP Adapter 已配置（${envName}）` : `等待配置 ${envName}`,
      };
    },
    discover: async (request) => {
      const { terms } = request;
      const baseUrl = process.env[envName]?.trim();
      if (!baseUrl) throw new Error(`${label} API Adapter 尚未配置，请设置 ${envName}`);
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...(process.env[keyEnvName] ? { Authorization: `Bearer ${process.env[keyEnvName]}` } : {}) },
        body: JSON.stringify(httpDiscoveryPayload(platform, request)),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`${label} API 返回 HTTP ${response.status}`);
      const payload = await response.json() as { posts?: unknown; logs?: unknown };
      const incompleteLogs: PlatformDiscoveryLog[] = [];
      const posts = Array.isArray(payload.posts) ? payload.posts.flatMap((value, index) => {
        if (!value || typeof value !== "object") {
          incompleteLogs.push({ timestamp: new Date().toISOString(), level: "warn", eventType: "candidate_incomplete", message: `HTTP Adapter 候选 ${index + 1} 不是对象`, payload: { candidateIndex: index } });
          return [];
        }
        const item = value as Record<string, unknown>;
        const externalId = typeof item.externalId === "string" ? item.externalId.trim() : "";
        const canonicalUrl = typeof item.canonicalUrl === "string" ? item.canonicalUrl.trim() : "";
        const author = typeof item.author === "string" ? item.author.trim() : "";
        const title = typeof item.title === "string" ? item.title.trim() : "";
        const body = typeof item.body === "string" ? item.body.trim() : undefined;
        const likes = typeof item.likes === "number" && Number.isFinite(item.likes) && item.likes >= 0 ? Math.round(item.likes) : undefined;
        const comments = typeof item.comments === "number" && Number.isFinite(item.comments) && item.comments >= 0 ? Math.round(item.comments) : undefined;
        const publishedAt = typeof item.publishedAt === "string" && !Number.isNaN(Date.parse(item.publishedAt)) ? item.publishedAt : undefined;
        const mediaType = item.mediaType === "视频" ? "视频" as const : item.mediaType === "图文" ? "图文" as const : item.mediaType === "文本" ? "文本" as const : undefined;
        const term = typeof item.term === "string" && terms.includes(item.term) ? item.term : undefined;
        const rawPayload = item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload) ? item.rawPayload as Record<string, unknown> : undefined;
        const cover = item.coverEvidence && typeof item.coverEvidence === "object" && !Array.isArray(item.coverEvidence) ? item.coverEvidence as Record<string, unknown> : {};
        const encoded = typeof cover.base64 === "string" ? cover.base64 : "";
        const bytes = encoded ? Buffer.from(encoded, "base64") : Buffer.alloc(0);
        const mimeType = cover.mimeType === "image/jpeg" ? "image/jpeg" as const : cover.mimeType === "image/webp" ? "image/webp" as const : cover.mimeType === "image/png" ? "image/png" as const : undefined;
        const capturedAt = typeof cover.capturedAt === "string" && !Number.isNaN(Date.parse(cover.capturedAt)) ? cover.capturedAt : undefined;
        const missing = [!externalId && "externalId", !canonicalUrl && "canonicalUrl", !author && "author", !title && "title", likes === undefined && "likes", comments === undefined && "comments", !publishedAt && "publishedAt", !mediaType && "mediaType", !term && "term", !rawPayload && "rawPayload", (!mimeType || !capturedAt || !bytes.length) && "coverEvidence"].filter((field): field is string => Boolean(field));
        if (missing.length) {
          incompleteLogs.push({ timestamp: new Date().toISOString(), level: "warn", eventType: "candidate_incomplete", message: `HTTP Adapter 候选 ${index + 1} 字段不完整：${missing.join("、")}`, term, payload: { candidateIndex: index, missing } });
          return [];
        }
        return [{ externalId, canonicalUrl, author, title, body, likes: likes!, comments: comments!, publishedAt: publishedAt!, mediaType: mediaType!, term: term!, rawPayload: rawPayload!, coverEvidence: { bytes, mimeType: mimeType!, capturedAt: capturedAt!, source: "platform_api" as const } }];
      }) : [];
      const logs = Array.isArray(payload.logs) ? payload.logs.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        const level = item.level === "error" ? "error" as const : item.level === "warn" ? "warn" as const : "info" as const;
        return [{ timestamp: typeof item.timestamp === "string" ? item.timestamp : new Date().toISOString(), level, eventType: typeof item.eventType === "string" ? item.eventType : "adapter_event", message: typeof item.message === "string" ? item.message : `${label} Adapter event`, term: typeof item.term === "string" ? item.term : undefined, page: typeof item.page === "number" ? item.page : undefined, payload: item.payload && typeof item.payload === "object" ? item.payload as Record<string, unknown> : undefined }];
      }) : [];
      return { posts, logs: [...logs, ...incompleteLogs] };
    },
  };
}

const adapters = new Map<string, PlatformAdapter>();
const tiktokAdapter: PlatformAdapter = {
  id: "tiktok-phone-v1",
  platform: "TikTok",
  label: "TikTok 手机 Adapter",
  status: () => ({ platform: "TikTok", id: "tiktok-phone-v1", label: "TikTok 手机 Adapter", configured: true, mode: "phone", capabilities: { phoneControl: true, identity: true, discovery: true, commentCollection: false, publishing: false, engagement: false }, requirements: { accountBinding: true, confirmedIdentity: true, phoneRunner: true, visualProvider: true }, extraction: { requiredFields: ["externalId", "canonicalUrl", "author", "title", "likes", "comments", "publishedAt", "mediaType", "term", "rawPayload", "coverEvidence"] }, discovery: { mediaTypes: ["any", "video"], stateMachineVersion: "mobile-discovery-v1", defaultCandidateLimit: 3 }, detail: "ADB + Appium UiAutomator2 + AutoGLM" }),
  discover: discoverTikTok,
};
adapters.set(tiktokAdapter.platform, tiktokAdapter);
const xhsPhoneAdapter: PlatformAdapter = {
  id: "xiaohongshu-mcp-phone-v1",
  platform: "小红书",
  label: "小红书 MCP + 手机视觉 Adapter",
  status: () => { let commentBot: "configured" | "missing" | "invalid" = "missing"; if (process.env.XIAOHONGSHU_COMMENT_BOT_BASE_URL?.trim()) { try { normalizeLoopbackServiceBaseUrl(process.env.XIAOHONGSHU_COMMENT_BOT_BASE_URL, "XIAOHONGSHU_COMMENT_BOT_BASE_URL"); commentBot = "configured"; } catch { commentBot = "invalid"; } } const publisher = xiaohongshuPublisherConfigurationState(); const mcp = xiaohongshuMcpConfigurationState(); return { platform: "小红书", id: "xiaohongshu-mcp-phone-v1", label: "小红书 MCP + 手机视觉 Adapter", configured: true, mode: mcp === "configured" ? "http" : "phone", capabilities: { phoneControl: true, identity: true, discovery: true, commentCollection: commentBot === "configured", publishing: publisher === "configured", engagement: false }, requirements: { accountBinding: true, confirmedIdentity: true, phoneRunner: true, visualProvider: false }, commentCollection: { requirements: { accountBinding: true, confirmedIdentity: true, phoneRunner: false } }, extraction: { requiredFields: ["externalId", "canonicalUrl", "author", "title", "body", "likes", "comments", "publishedAt", "mediaType", "term", "rawPayload", "coverEvidence"] }, discovery: { mediaTypes: ["any", "video", "image_text"], stateMachineVersion: "xiaohongshu-mcp-primary-mobile-fallback-v1", defaultCandidateLimit: 3 }, detail: `${mcp === "configured" ? "结构化 MCP 主抓取，Android 手机视觉自动回退" : mcp === "invalid" ? "MCP 配置无效，当前直接使用 Android 手机视觉" : "MCP 未配置，当前直接使用 Android 手机视觉"}；详情标题/正文/真实分享链接/封面字段清单；评论 Bot ${commentBot === "configured" ? "已配置" : commentBot === "invalid" ? "地址无效" : "未配置"}；Publisher API ${publisher === "configured" ? "已配置" : publisher === "invalid" ? "地址无效" : "未配置"}` }; },
  discover: async (request) => xiaohongshuMcpConfigurationState() === "configured"
    ? discoverXiaohongshuViaMcp(request, { captureDetailScreenshot: (post) => captureXiaohongshuCover(request.accountId, post, request.deviceId) })
    : discoverXiaohongshu(request),
  discoveryFallback: {
    enabled: () => xiaohongshuMcpConfigurationState() === "configured",
    discover: async (request) => discoverXiaohongshu(request),
  },
  captureCover: async (accountId, post, deviceId) => captureXiaohongshuCover(accountId, post, deviceId),
  sourceLinkStatus: (post) => {
    const embeddedExternalId = xiaohongshuExternalId(post.canonicalUrl);
    const usable = isUsableXiaohongshuAccessUrl(post.canonicalUrl) && (!embeddedExternalId || embeddedExternalId === post.externalId);
    return usable ? { usable: true } : { usable: false, reason: "旧记录丢失了小红书分享访问凭证，需要重新抓取后才能打开原帖。" };
  },
  collectComments: async (accountId, post, limit) => {
    const baseUrl = normalizeLoopbackServiceBaseUrl(process.env.XIAOHONGSHU_COMMENT_BOT_BASE_URL, "XIAOHONGSHU_COMMENT_BOT_BASE_URL");
    if (!baseUrl) throw new Error("小红书评论 Bot 尚未配置");
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/comments`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...(process.env.XIAOHONGSHU_COMMENT_BOT_KEY ? { Authorization: `Bearer ${process.env.XIAOHONGSHU_COMMENT_BOT_KEY}` } : {}) }, body: JSON.stringify({ platform: "小红书", accountId, externalId: post.externalId, canonicalUrl: post.canonicalUrl, limit }), signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`小红书评论 Bot 返回 HTTP ${response.status}`);
    const payload = await response.json() as { comments?: unknown; logs?: unknown };
    const comments = Array.isArray(payload.comments) ? payload.comments.flatMap((value) => { if (!value || typeof value !== "object") return []; const item = value as Record<string, unknown>; if (typeof item.body !== "string" || !item.body.trim()) return []; return [{ externalId: typeof item.externalId === "string" ? item.externalId : undefined, author: typeof item.author === "string" ? item.author : undefined, body: item.body, likes: typeof item.likes === "number" ? item.likes : undefined, publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : undefined }]; }) : [];
    const logs = Array.isArray(payload.logs) ? payload.logs.flatMap((value) => { if (!value || typeof value !== "object") return []; const item = value as Record<string, unknown>; return [{ timestamp: typeof item.timestamp === "string" ? item.timestamp : new Date().toISOString(), level: item.level === "error" ? "error" as const : item.level === "warn" ? "warn" as const : "info" as const, eventType: typeof item.eventType === "string" ? item.eventType : "comment_bot_event", message: typeof item.message === "string" ? item.message : "评论 Bot 事件" }]; }) : [];
    return { comments, logs };
  },
};
adapters.set(xhsPhoneAdapter.platform, xhsPhoneAdapter);
for (const [platform, envName] of [["抖音", "DOUYIN_API_BASE_URL"], ["Reddit", "REDDIT_API_BASE_URL"], ["X", "X_API_BASE_URL"], ["Instagram", "INSTAGRAM_API_BASE_URL"]] as const) {
  adapters.set(platform, createHttpAdapter(platform, `${platform} HTTP Adapter`, envName));
}

export function getPlatformAdapter(platform: string): PlatformAdapter | undefined { return adapters.get(platform); }
export function listPlatformAdapters(): PlatformAdapterStatus[] { return [...adapters.values()].map((adapter) => adapter.status()); }
export function platformAdapterStatus(platform: string): PlatformAdapterStatus {
  return getPlatformAdapter(platform)?.status() ?? { platform, id: "unregistered", label: `${platform} Adapter`, configured: false, mode: "http", capabilities: { phoneControl: false, identity: false, discovery: false, commentCollection: false, publishing: false, engagement: false }, requirements: { accountBinding: false, confirmedIdentity: false, phoneRunner: false, visualProvider: false }, extraction: { requiredFields: [] }, discovery: { mediaTypes: ["any"], stateMachineVersion: "unregistered", defaultCandidateLimit: 3 }, detail: "平台未注册" };
}

export function emptyPlatformDiscovery(): PlatformDiscoveryResult { return emptyResult(); }
