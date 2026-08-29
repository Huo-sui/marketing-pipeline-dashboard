import type { PublisherAdapter, PublisherResult } from "../publishers.js";
import { isAllowedXiaohongshuUrl, xiaohongshuExternalId } from "./xiaohongshuUrl.ts";
import { normalizeLoopbackServiceBaseUrl } from "./loopbackServiceUrl.ts";

type PublisherConfigurationState = "configured" | "missing" | "invalid";

function requiredResponseString(value: unknown, field: string, maxLength = 2_000) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`小红书 Publisher 响应缺少 ${field}`);
  const result = value.trim();
  if (result.length > maxLength) throw new Error(`小红书 Publisher 响应中的 ${field} 超出长度限制`);
  return result;
}

export function normalizeLoopbackPublisherBaseUrl(value: string | undefined) {
  return normalizeLoopbackServiceBaseUrl(value, "XIAOHONGSHU_PUBLISHER_BASE_URL");
}

export function xiaohongshuPublisherConfigurationState(): PublisherConfigurationState {
  if (!process.env.XIAOHONGSHU_PUBLISHER_BASE_URL?.trim()) return "missing";
  try {
    normalizeLoopbackPublisherBaseUrl(process.env.XIAOHONGSHU_PUBLISHER_BASE_URL);
    return "configured";
  } catch {
    return "invalid";
  }
}

export function parseXiaohongshuPublisherResult(value: unknown): PublisherResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("小红书 Publisher 响应必须是 JSON 对象");
  const payload = value as Record<string, unknown>;
  const status = requiredResponseString(payload.status, "status", 100);
  const externalRequestId = typeof payload.externalRequestId === "string" && payload.externalRequestId.trim() ? payload.externalRequestId.trim().slice(0, 500) : undefined;
  if (status === "succeeded") {
    const platformPostId = requiredResponseString(payload.platformPostId, "platformPostId", 200);
    const canonicalUrl = requiredResponseString(payload.canonicalUrl, "canonicalUrl", 2_000);
    const urlPostId = xiaohongshuExternalId(canonicalUrl);
    if (!isAllowedXiaohongshuUrl(canonicalUrl) || !urlPostId || urlPostId.toLowerCase() !== platformPostId.toLowerCase()) {
      throw new Error("小红书 Publisher 必须返回与 platformPostId 一致的真实 canonicalUrl");
    }
    const publishedAt = requiredResponseString(payload.publishedAt, "publishedAt", 100);
    const parsedPublishedAt = new Date(publishedAt);
    if (Number.isNaN(parsedPublishedAt.getTime())) throw new Error("小红书 Publisher 返回的 publishedAt 无效");
    return { status, platformPostId, canonicalUrl: `https://www.xiaohongshu.com/explore/${urlPostId}`, publishedAt: parsedPublishedAt.toISOString(), externalRequestId };
  }
  if (status === "failed_retryable" || status === "unknown_requires_review") {
    return { status, code: requiredResponseString(payload.code, "code", 200), message: requiredResponseString(payload.message, "message", 2_000), externalRequestId };
  }
  throw new Error("小红书 Publisher 返回了不支持的 status");
}

export const xiaohongshuHttpPublisher: PublisherAdapter = {
  id: "xiaohongshu-phone-publisher-http-v1",
  platform: "小红书",
  requirements: { confirmedIdentity: true, phoneRunner: true },
  configured: () => xiaohongshuPublisherConfigurationState() === "configured",
  publish: async (input) => {
    const baseUrl = normalizeLoopbackPublisherBaseUrl(process.env.XIAOHONGSHU_PUBLISHER_BASE_URL);
    if (!baseUrl) throw new Error("小红书 Publisher API 尚未配置");
    const response = await fetch(`${baseUrl}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(process.env.XIAOHONGSHU_PUBLISHER_KEY ? { Authorization: `Bearer ${process.env.XIAOHONGSHU_PUBLISHER_KEY}` } : {}),
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        contractVersion: 1,
        publicationDraftId: input.publicationDraftId,
        idempotencyKey: input.idempotencyKey,
        platform: input.platform,
        title: input.title,
        copy: input.copy,
        account: input.account,
        runner: input.runner,
        artifacts: input.artifacts.map(({ id, mimeType, originalName, sha256, contentUrl }) => ({ id, mimeType, originalName, sha256, contentUrl })),
      }),
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (!response.ok) throw new Error(`小红书 Publisher API 返回 HTTP ${response.status}；提交结果需要人工核查`);
    return parseXiaohongshuPublisherResult(await response.json());
  },
};
