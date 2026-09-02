import type { PlatformDiscoveryPost, PlatformDiscoveryResult } from "../platforms.js";
import type { DiscoveryMachineLog, PlatformDiscoveryRequest } from "../mobile/discoveryStateMachine.js";
import { normalizeLoopbackServiceBaseUrl } from "./loopbackServiceUrl.ts";
import { isUsableXiaohongshuAccessUrl, xiaohongshuExternalId } from "./xiaohongshuUrl.ts";

const DEFAULT_TIMEOUT_MS = 70_000;

export type XiaohongshuMcpConfiguration = {
  baseUrl: string;
  accountId: string;
  token?: string;
  timeoutMs: number;
};

export type XiaohongshuMcpConfigurationState = "configured" | "missing" | "invalid";

export class XiaohongshuMcpError extends Error {
  readonly code: "timeout" | "not_logged_in" | "identity_mismatch" | "risk_control" | "protocol" | "http" | "field_incomplete";

  constructor(
    code: "timeout" | "not_logged_in" | "identity_mismatch" | "risk_control" | "protocol" | "http" | "field_incomplete",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "XiaohongshuMcpError";
    this.code = code;
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 5_000 || parsed > 180_000) throw new Error("XIAOHONGSHU_MCP_TIMEOUT_MS 必须是 5000 到 180000 之间的整数");
  return parsed;
}

export function xiaohongshuMcpConfiguration(env: NodeJS.ProcessEnv = process.env): XiaohongshuMcpConfiguration | undefined {
  const baseUrl = normalizeLoopbackServiceBaseUrl(env.XIAOHONGSHU_MCP_BASE_URL, "XIAOHONGSHU_MCP_BASE_URL");
  if (!baseUrl) return undefined;
  const accountId = env.XIAOHONGSHU_MCP_ACCOUNT_ID?.trim();
  if (!accountId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(accountId)) throw new Error("XIAOHONGSHU_MCP_ACCOUNT_ID 必须绑定一个已确认的小红书账号 UUID");
  return { baseUrl, accountId, token: env.XIAOHONGSHU_MCP_TOKEN?.trim() || undefined, timeoutMs: positiveInteger(env.XIAOHONGSHU_MCP_TIMEOUT_MS, DEFAULT_TIMEOUT_MS) };
}

export function xiaohongshuMcpConfigurationState(env: NodeJS.ProcessEnv = process.env): XiaohongshuMcpConfigurationState {
  if (!env.XIAOHONGSHU_MCP_BASE_URL?.trim()) return "missing";
  try { return xiaohongshuMcpConfiguration(env) ? "configured" : "missing"; }
  catch { return "invalid"; }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value);
  const text = stringValue(value).replace(/,/g, "").toLowerCase();
  if (!text) return undefined;
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(万|w|k)?$/i);
  if (!match) return undefined;
  const multiplier = match[2] === "万" || match[2]?.toLowerCase() === "w" ? 10_000 : match[2]?.toLowerCase() === "k" ? 1_000 : 1;
  return Math.round(Number(match[1]) * multiplier);
}

function parsePublishedAt(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1_000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  const text = stringValue(value);
  if (!text) return undefined;
  if (/^\d{10,13}$/.test(text)) return parsePublishedAt(Number(text));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function mediaType(value: unknown): PlatformDiscoveryPost["mediaType"] | undefined {
  const text = stringValue(value).toLowerCase();
  if (text === "video" || text === "视频") return "视频";
  if (["normal", "image", "note", "图文"].includes(text)) return "图文";
  return undefined;
}

function log(level: DiscoveryMachineLog["level"], eventType: string, message: string, term?: string, payload?: Record<string, unknown>): DiscoveryMachineLog {
  return { timestamp: new Date().toISOString(), level, eventType, message, term, page: term ? 1 : undefined, payload };
}

function classifyMessage(message: string) {
  const lower = message.toLowerCase();
  if (/验证码|风控|risk.?control|captcha|访问频繁|异常环境|安全验证/.test(lower)) return new XiaohongshuMcpError("risk_control", `小红书 MCP 遇到验证码或风控：${message}`);
  if (/未登录|not logged|login required|请先登录|登录失效/.test(lower)) return new XiaohongshuMcpError("not_logged_in", `小红书 MCP 登录不可用：${message}`);
  return new XiaohongshuMcpError("protocol", `小红书 MCP 调用失败：${message}`);
}

function mcpEnvelope(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text) as unknown;
    const parsed = record(value);
    if (parsed) return parsed;
  } catch { /* Try SSE below. */ }
  const dataLines = text.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter((line) => line && line !== "[DONE]");
  for (let index = dataLines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = record(JSON.parse(dataLines[index]) as unknown);
      if (parsed) return parsed;
    } catch { /* Keep looking for the final JSON event. */ }
  }
  throw new XiaohongshuMcpError("protocol", "小红书 MCP 返回的不是有效 JSON-RPC 或 SSE 数据");
}

function toolText(envelope: Record<string, unknown>) {
  const error = record(envelope.error);
  if (error) throw classifyMessage(stringValue(error.message) || "JSON-RPC error");
  const result = record(envelope.result);
  if (!result) throw new XiaohongshuMcpError("protocol", "小红书 MCP 响应缺少 result");
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.map(record).map((item) => item && item.type === "text" ? stringValue(item.text) : "").filter(Boolean).join("\n");
  if (result.isError === true) throw classifyMessage(text || "tool error");
  if (!text) throw new XiaohongshuMcpError("protocol", "小红书 MCP 工具没有返回文本内容");
  return text;
}

async function callTool(
  config: XiaohongshuMcpConfiguration,
  name: string,
  args: Record<string, unknown>,
  fetchImpl: typeof fetch,
) {
  let response: Response;
  try {
    const endpoint = config.baseUrl.endsWith("/mcp") ? config.baseUrl : `${config.baseUrl}/mcp`;
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name, arguments: args } }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new XiaohongshuMcpError("timeout", `小红书 MCP ${name} 超过 ${config.timeoutMs}ms 未响应`, { cause: error });
    throw new XiaohongshuMcpError("http", `无法连接小红书 MCP：${error instanceof Error ? error.message : "未知网络错误"}`, { cause: error });
  }
  let text: string;
  try { text = await response.text(); }
  catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new XiaohongshuMcpError("timeout", `小红书 MCP ${name} 响应体超过 ${config.timeoutMs}ms 未完成`, { cause: error });
    throw new XiaohongshuMcpError("http", `读取小红书 MCP 响应失败：${error instanceof Error ? error.message : "未知网络错误"}`, { cause: error });
  }
  if (!response.ok) throw classifyMessage(`HTTP ${response.status}${text ? ` · ${text.slice(0, 300)}` : ""}`);
  return toolText(mcpEnvelope(text));
}

function toolJson(text: string, toolName: string): Record<string, unknown> {
  try {
    const parsed = record(JSON.parse(text) as unknown);
    if (parsed) return parsed;
  } catch { /* Classify plain-text tool failures below. */ }
  throw classifyMessage(`${toolName} 返回非结构化结果：${text.slice(0, 500)}`);
}

function searchFeeds(payload: Record<string, unknown>) {
  const data = record(payload.data);
  const feeds = Array.isArray(payload.feeds) ? payload.feeds : Array.isArray(data?.feeds) ? data.feeds : [];
  return feeds.map(record).filter((item): item is Record<string, unknown> => Boolean(item));
}

function detailNote(payload: Record<string, unknown>) {
  const data = record(payload.data);
  const feed = record(payload.feed) ?? record(data?.feed);
  return record(payload.note) ?? record(data?.note) ?? record(feed?.note);
}

function detailComments(payload: Record<string, unknown>) {
  const data = record(payload.data);
  const comments = Array.isArray(payload.comments) ? payload.comments : Array.isArray(data?.comments) ? data.comments : [];
  return comments.map(record).filter((item): item is Record<string, unknown> => Boolean(item));
}

export async function discoverXiaohongshuViaMcp(
  request: PlatformDiscoveryRequest,
  options: {
    config?: XiaohongshuMcpConfiguration;
    fetchImpl?: typeof fetch;
    captureDetailScreenshot: (post: Pick<PlatformDiscoveryPost, "externalId" | "canonicalUrl" | "author" | "title">) => Promise<PlatformDiscoveryPost["coverEvidence"]>;
  },
): Promise<PlatformDiscoveryResult> {
  const config = options.config ?? xiaohongshuMcpConfiguration();
  if (!config) throw new XiaohongshuMcpError("http", "小红书 MCP 尚未配置 XIAOHONGSHU_MCP_BASE_URL");
  if (config.accountId !== request.accountId) throw new XiaohongshuMcpError("identity_mismatch", `小红书 MCP 绑定账号 ${config.accountId} 与规则采集账号 ${request.accountId} 不一致`);
  const fetchImpl = options.fetchImpl ?? fetch;
  const logs: DiscoveryMachineLog[] = [];
  const posts: PlatformDiscoveryPost[] = [];

  const login = await callTool(config, "check_login_status", {}, fetchImpl);
  if (/未登录|请先登录|not logged|login required/i.test(login)) throw new XiaohongshuMcpError("not_logged_in", `小红书 MCP 登录不可用：${login}`);
  if (!/已登录|logged in|login status\s*:\s*true/i.test(login)) throw classifyMessage(`无法确认 MCP 登录状态：${login}`);
  logs.push(log("info", "mcp_session_ready", "小红书 MCP 登录状态已确认", undefined, { traceId: request.traceId }));

  for (const term of request.terms) {
    logs.push(log("info", "term_started", `MCP 开始搜索关键词：${term}`, term, { traceId: request.traceId }));
    const searchText = await callTool(config, "search_feeds", {
      keyword: term,
      filters: {
        sort_by: "最多点赞",
        note_type: request.policy.mediaTypeFilter === "video" ? "视频" : request.policy.mediaTypeFilter === "image_text" ? "图文" : "不限",
        publish_time: "一周内",
        search_scope: "未看过",
      },
    }, fetchImpl);
    const searchPayload = toolJson(searchText, "search_feeds");
    const candidates = searchFeeds(searchPayload).slice(0, request.policy.candidateLimitPerTerm);
    logs.push(log("info", "mcp_filters_verified", `MCP 已应用最多点赞、一周内、未看过和内容类型筛选；检查前 ${candidates.length} 条候选`, term, { candidateLimit: request.policy.candidateLimitPerTerm, mediaTypeFilter: request.policy.mediaTypeFilter }));

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const noteCard = record(candidate.noteCard) ?? {};
      const externalId = stringValue(candidate.id) || stringValue(noteCard.noteId) || stringValue(noteCard.id);
      const xsecToken = stringValue(candidate.xsecToken) || stringValue(noteCard.xsecToken);
      if (!externalId || !xsecToken) {
        logs.push(log("warn", "candidate_incomplete", `MCP 候选 ${index + 1} 缺少 feed_id 或 xsec_token`, term, { candidateIndex: index, missing: [!externalId && "externalId", !xsecToken && "xsecToken"].filter(Boolean) }));
        continue;
      }
      try {
        const detailText = await callTool(config, "get_feed_detail", { feed_id: externalId, xsec_token: xsecToken, load_all_comments: false }, fetchImpl);
        const detailPayload = toolJson(detailText, "get_feed_detail");
        const note = detailNote(detailPayload);
        if (!note) throw new XiaohongshuMcpError("field_incomplete", "详情响应缺少 note");
        const detailExternalId = stringValue(note.noteId) || stringValue(note.id);
        if (!detailExternalId || detailExternalId !== externalId) throw new XiaohongshuMcpError("field_incomplete", `搜索候选与详情帖子身份不一致：candidate=${externalId} detail=${detailExternalId || "missing"}`);
        const user = record(note.user) ?? record(noteCard.user) ?? {};
        const interact = record(note.interactInfo) ?? record(noteCard.interactInfo) ?? {};
        const title = stringValue(note.title) || stringValue(note.displayTitle) || stringValue(noteCard.displayTitle);
        const body = stringValue(note.desc);
        const author = stringValue(user.nickname) || stringValue(user.nickName) || stringValue(user.name);
        const likes = parseCount(interact.likedCount ?? interact.likes);
        const comments = parseCount(interact.commentCount ?? interact.comments);
        const publishedAt = parsePublishedAt(note.time ?? note.publishTime ?? note.publishedAt);
        const type = mediaType(note.type ?? noteCard.type);
        const missing = [!title && "title", !body && "body", !author && "author", likes === undefined && "likes", comments === undefined && "comments", !publishedAt && "publishedAt", !type && "mediaType"].filter((value): value is string => Boolean(value));
        if (missing.length) throw new XiaohongshuMcpError("field_incomplete", `详情字段不完整：${missing.join("、")}`);
        const canonicalUrl = `https://www.xiaohongshu.com/explore/${encodeURIComponent(externalId)}?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=pc_search`;
        if (xiaohongshuExternalId(canonicalUrl) !== externalId || !isUsableXiaohongshuAccessUrl(canonicalUrl)) throw new XiaohongshuMcpError("field_incomplete", "MCP 返回的 feed_id 或访问链接无效");
        const coverEvidence = await options.captureDetailScreenshot({ externalId, canonicalUrl, author, title });
        if (coverEvidence.source !== "device_screenshot" || !coverEvidence.bytes.length) throw new XiaohongshuMcpError("field_incomplete", "未取得小红书详情首屏手机截图证据");
        posts.push({
          externalId,
          canonicalUrl,
          author,
          title,
          body,
          likes: likes!,
          comments: comments!,
          publishedAt: publishedAt!,
          mediaType: type!,
          term,
          rawPayload: {
            source: "xiaohongshu-mcp",
            traceId: request.traceId,
            searchCandidate: candidate,
            detail: detailPayload,
            comments: detailComments(detailPayload),
            filterEvidence: { sortBy: "最多点赞", publishTime: "一周内", searchScope: "未看过", noteType: request.policy.mediaTypeFilter },
          },
          coverEvidence,
        });
        logs.push(log("info", "candidate_extracted", `MCP 候选 ${index + 1} 字段与真实访问链接采集完成`, term, { candidateIndex: index, externalId, likes, comments }));
      } catch (error) {
        if (error instanceof XiaohongshuMcpError && error.code !== "field_incomplete") throw error;
        logs.push(log("warn", "candidate_incomplete", `MCP 候选 ${index + 1} 未完成：${error instanceof Error ? error.message : "未知字段错误"}`, term, { candidateIndex: index, externalId }));
      }
    }
    logs.push(log("info", "term_completed", `MCP 关键词完成：检查 ${candidates.length} 条候选，取得 ${posts.filter((post) => post.term === term).length} 条字段完整帖子`, term, { checked: candidates.length, captured: posts.filter((post) => post.term === term).length }));
  }
  logs.push(log("info", "mcp_run_complete", `小红书 MCP 抓取完成，共取得 ${posts.length} 条字段完整帖子`, undefined, { traceId: request.traceId }));
  return { posts, logs };
}
