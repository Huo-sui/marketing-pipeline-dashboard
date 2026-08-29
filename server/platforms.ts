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
import { discoverXiaohongshu } from "./platforms/xiaohongshuPhoneAdapter.js";

export type PlatformAdapterRequirements = {
  accountBinding: boolean;
  confirmedIdentity: boolean;
  phoneRunner: boolean;
  visualProvider: boolean;
};

export type PlatformDiscoveryRequiredField = "externalId" | "canonicalUrl" | "author" | "title" | "likes" | "comments" | "publishedAt" | "mediaType" | "term" | "rawPayload";

export type PlatformAdapterStatus = {
  platform: string;
  id: string;
  label: string;
  configured: boolean;
  mode: "phone" | "http";
  capabilities: { phoneControl: boolean; identity: boolean; discovery: boolean; publishing: boolean; engagement: boolean };
  requirements: PlatformAdapterRequirements;
  extraction: { requiredFields: PlatformDiscoveryRequiredField[] };
  detail: string;
};

export type PlatformDiscoveryPost = {
  externalId: string;
  canonicalUrl: string;
  author: string;
  title: string;
  likes: number;
  comments: number;
  publishedAt?: string;
  mediaType: "视频" | "图文" | "文本";
  term: string;
  rawPayload: Record<string, unknown>;
};
export type PlatformDiscoveryLog = TikTokDiscoveryResult["logs"][number];
export type PlatformDiscoveryResult = { posts: PlatformDiscoveryPost[]; logs: PlatformDiscoveryLog[] };

export type PlatformAdapter = {
  id: string;
  platform: string;
  label: string;
  status: () => PlatformAdapterStatus;
  discover: (accountId: string, terms: string[], deviceId?: string) => Promise<PlatformDiscoveryResult>;
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
        capabilities: { phoneControl: false, identity: false, discovery: Boolean(baseUrl), publishing: false, engagement: false },
        requirements: { accountBinding: false, confirmedIdentity: false, phoneRunner: false, visualProvider: false },
        extraction: { requiredFields: ["externalId", "canonicalUrl", "title", "likes", "comments", "mediaType", "term", "rawPayload"] },
        detail: baseUrl ? `HTTP Adapter 已配置（${envName}）` : `等待配置 ${envName}`,
      };
    },
    discover: async (_accountId, terms) => {
      const baseUrl = process.env[envName]?.trim();
      if (!baseUrl) throw new Error(`${label} API Adapter 尚未配置，请设置 ${envName}`);
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...(process.env[keyEnvName] ? { Authorization: `Bearer ${process.env[keyEnvName]}` } : {}) },
        body: JSON.stringify({ platform, terms }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`${label} API 返回 HTTP ${response.status}`);
      const payload = await response.json() as { posts?: unknown; logs?: unknown };
      const posts = Array.isArray(payload.posts) ? payload.posts.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        const externalId = typeof item.externalId === "string" ? item.externalId.trim() : "";
        const canonicalUrl = typeof item.canonicalUrl === "string" ? item.canonicalUrl.trim() : "";
        if (!externalId || !canonicalUrl) return [];
        const mediaType = item.mediaType === "视频" ? "视频" as const : item.mediaType === "图文" ? "图文" as const : "文本" as const;
        return [{ externalId, canonicalUrl, author: typeof item.author === "string" ? item.author : "", title: typeof item.title === "string" ? item.title : "", likes: typeof item.likes === "number" ? Math.max(0, Math.round(item.likes)) : 0, comments: typeof item.comments === "number" ? Math.max(0, Math.round(item.comments)) : 0, publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : undefined, mediaType, term: typeof item.term === "string" ? item.term : terms[0] ?? "", rawPayload: item.rawPayload && typeof item.rawPayload === "object" ? item.rawPayload as Record<string, unknown> : item }];
      }) : [];
      const logs = Array.isArray(payload.logs) ? payload.logs.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        const level = item.level === "error" ? "error" as const : item.level === "warn" ? "warn" as const : "info" as const;
        return [{ timestamp: typeof item.timestamp === "string" ? item.timestamp : new Date().toISOString(), level, eventType: typeof item.eventType === "string" ? item.eventType : "adapter_event", message: typeof item.message === "string" ? item.message : `${label} Adapter event`, term: typeof item.term === "string" ? item.term : undefined, page: typeof item.page === "number" ? item.page : undefined, payload: item.payload && typeof item.payload === "object" ? item.payload as Record<string, unknown> : undefined }];
      }) : [];
      return { posts, logs };
    },
  };
}

const adapters = new Map<string, PlatformAdapter>();
const tiktokAdapter: PlatformAdapter = {
  id: "tiktok-phone-v1",
  platform: "TikTok",
  label: "TikTok 手机 Adapter",
  status: () => ({ platform: "TikTok", id: "tiktok-phone-v1", label: "TikTok 手机 Adapter", configured: true, mode: "phone", capabilities: { phoneControl: true, identity: true, discovery: true, publishing: false, engagement: false }, requirements: { accountBinding: true, confirmedIdentity: true, phoneRunner: true, visualProvider: true }, extraction: { requiredFields: ["externalId", "canonicalUrl", "author", "title", "likes", "comments", "publishedAt", "mediaType", "term", "rawPayload"] }, detail: "ADB + Appium UiAutomator2 + AutoGLM" }),
  discover: async (accountId, terms, deviceId) => discoverTikTok(accountId, terms, deviceId),
};
adapters.set(tiktokAdapter.platform, tiktokAdapter);
const xhsPhoneAdapter: PlatformAdapter = {
  id: "xiaohongshu-phone-v1",
  platform: "小红书",
  label: "小红书手机 Adapter",
  status: () => ({ platform: "小红书", id: "xiaohongshu-phone-v1", label: "小红书手机 Adapter", configured: true, mode: "phone", capabilities: { phoneControl: true, identity: true, discovery: true, publishing: false, engagement: false }, requirements: { accountBinding: true, confirmedIdentity: true, phoneRunner: true, visualProvider: false }, extraction: { requiredFields: ["externalId", "canonicalUrl", "author", "title", "likes", "comments", "publishedAt", "mediaType", "term", "rawPayload"] }, detail: "Android Driver + 小红书字段清单 Playbook（作者/标题/指标/发布时间/媒体类型/真实链接）" }),
  discover: async (accountId, terms, deviceId) => discoverXiaohongshu(accountId, terms, deviceId),
};
adapters.set(xhsPhoneAdapter.platform, xhsPhoneAdapter);
for (const [platform, envName] of [["抖音", "DOUYIN_API_BASE_URL"], ["Reddit", "REDDIT_API_BASE_URL"], ["X", "X_API_BASE_URL"], ["Instagram", "INSTAGRAM_API_BASE_URL"]] as const) {
  adapters.set(platform, createHttpAdapter(platform, `${platform} HTTP Adapter`, envName));
}

export function getPlatformAdapter(platform: string): PlatformAdapter | undefined { return adapters.get(platform); }
export function listPlatformAdapters(): PlatformAdapterStatus[] { return [...adapters.values()].map((adapter) => adapter.status()); }
export function platformAdapterStatus(platform: string): PlatformAdapterStatus {
  return getPlatformAdapter(platform)?.status() ?? { platform, id: "unregistered", label: `${platform} Adapter`, configured: false, mode: "http", capabilities: { phoneControl: false, identity: false, discovery: false, publishing: false, engagement: false }, requirements: { accountBinding: false, confirmedIdentity: false, phoneRunner: false, visualProvider: false }, extraction: { requiredFields: [] }, detail: "平台未注册" };
}

export function emptyPlatformDiscovery(): PlatformDiscoveryResult { return emptyResult(); }
