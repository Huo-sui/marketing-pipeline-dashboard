const DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_MODEL = "autoglm-phone";
// A normal-sized public image keeps this diagnostic focused on API auth and
// multimodal request parsing. Tiny placeholder images can be rejected by the
// provider's vision pipeline as an upstream network/decoding failure.
const TEST_IMAGE_URL = "https://cdn.bigmodel.cn/static/logo/register.png";

type AutoGlmMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};

type AutoGlmResponse = {
  id?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

export type PhoneAgentAction =
  | { kind: "tap"; x: number; y: number }
  | { kind: "swipe"; startX: number; startY: number; endX: number; endY: number }
  | { kind: "type"; text: string }
  | { kind: "back" }
  | { kind: "wait"; seconds: number }
  | { kind: "finish"; message: string };

export class AutoGlmProviderError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 502, code = "AUTOGLM_PROVIDER_ERROR") {
    super(message);
    this.name = "AutoGlmProviderError";
    this.status = status;
    this.code = code;
  }
}

function normalizedBaseUrl(value?: string) {
  return (value?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function credential() {
  const entries = [
    ["ZHIPU_API_KEY", process.env.ZHIPU_API_KEY],
    ["ZAI_API_KEY", process.env.ZAI_API_KEY],
    ["BIGMODEL_API_KEY", process.env.BIGMODEL_API_KEY],
  ] as const;
  return entries.find(([, value]) => Boolean(value?.trim()));
}

export function autoGlmProviderStatus() {
  const secret = credential();
  return {
    id: "zhipu-autoglm-phone" as const,
    label: "智谱 AutoGLM-Phone",
    configured: Boolean(secret),
    baseUrl: normalizedBaseUrl(process.env.ZHIPU_AUTOGLM_BASE_URL),
    model: process.env.ZHIPU_AUTOGLM_MODEL?.trim() || DEFAULT_MODEL,
    credentialSource: secret?.[0],
    pricing: "limited_free" as const,
  };
}

export async function requestAutoGlm(messages: AutoGlmMessage[], maxTokens = 300, timeoutMs = 60_000) {
  const status = autoGlmProviderStatus();
  const secret = credential()?.[1]?.trim();
  if (!secret) throw new AutoGlmProviderError("智谱 API Key 尚未配置，请在服务端环境中设置 ZHIPU_API_KEY", 424, "AUTOGLM_NOT_CONFIGURED");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${status.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: status.model,
        messages,
        max_tokens: maxTokens,
        // Keep this aligned with the official Open-AutoGLM client. The model
        // is trained to make deterministic, stepwise decisions from a phone
        // screenshot rather than to act as a free-form chat completion model.
        temperature: 0,
        top_p: 0.85,
        frequency_penalty: 0.2,
        stream: false,
      }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload: AutoGlmResponse & { error?: { message?: string; code?: string } } = {};
    try { payload = raw ? JSON.parse(raw) as typeof payload : {}; } catch { /* handled below */ }
    if (!response.ok) {
      const providerMessage = payload.error?.message?.slice(0, 500);
      throw new AutoGlmProviderError(providerMessage || `智谱 API 返回 HTTP ${response.status}`, response.status, payload.error?.code || "AUTOGLM_HTTP_ERROR");
    }
    if (!payload.choices?.length) throw new AutoGlmProviderError("智谱 API 响应缺少 choices", 502, "AUTOGLM_INVALID_RESPONSE");
    return payload;
  } catch (error) {
    if (error instanceof AutoGlmProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new AutoGlmProviderError(`智谱 API 请求超时（${Math.round(timeoutMs / 1000)} 秒）`, 504, "AUTOGLM_TIMEOUT");
    throw new AutoGlmProviderError(error instanceof Error ? error.message : "智谱 API 请求失败");
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractPlatformPostsFromScreenshot(image: Buffer, term: string, platform = "TikTok") {
  const response = await requestAutoGlm([
    { role: "system", content: `你是内容采集视觉解析器。只读取截图中明确可见的 ${platform} 搜索结果，不要猜测或补全。严格只输出 JSON 数组，每项字段为 externalId、author、title、likes、comments；看不到 externalId 的项目不要输出。likes/comments 必须是整数。` },
    { role: "user", content: [
      { type: "image_url", image_url: { url: `data:image/png;base64,${image.toString("base64")}` } },
      { type: "text", text: `追踪词：${term}\n请解析当前截图中可见的搜索结果。` },
    ] },
  // A full phone screenshot has materially more visual tokens than the small
  // provider health-check image. The official agent client does not apply a
  // 15-second inference cap, so preserve an explicit but realistic budget.
  ], 600, 60_000);
  const content = response.choices?.[0]?.message?.content ?? "";
  const json = content.match(/\[[\s\S]*\]/)?.[0];
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")).map((item) => ({
      externalId: typeof item.externalId === "string" ? item.externalId : "",
      author: typeof item.author === "string" ? item.author : "",
      title: typeof item.title === "string" ? item.title : "",
      likes: typeof item.likes === "number" ? Math.max(0, Math.round(item.likes)) : 0,
      comments: typeof item.comments === "number" ? Math.max(0, Math.round(item.comments)) : 0,
    })).filter((item) => /^\d{8,}$/.test(item.externalId));
  } catch { return []; }
}

/** Backwards-compatible TikTok name for existing workers. */
export const extractTikTokPostsFromScreenshot = (image: Buffer, term: string) => extractPlatformPostsFromScreenshot(image, term, "TikTok");

function parsePhoneAction(content: string): PhoneAgentAction {
  const finish = content.match(/finish\s*\(\s*message\s*=\s*["']([\s\S]*?)["']\s*\)/i);
  if (finish) return { kind: "finish", message: finish[1] };
  const tap = content.match(/do\s*\(\s*action\s*=\s*["']Tap["'][\s\S]*?element\s*=\s*\[\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\]/i);
  if (tap) return { kind: "tap", x: Number(tap[1]), y: Number(tap[2]) };
  const swipe = content.match(/do\s*\(\s*action\s*=\s*["']Swipe["'][\s\S]*?start\s*=\s*\[\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\][\s\S]*?end\s*=\s*\[\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\]/i);
  if (swipe) return { kind: "swipe", startX: Number(swipe[1]), startY: Number(swipe[2]), endX: Number(swipe[3]), endY: Number(swipe[4]) };
  const type = content.match(/do\s*\(\s*action\s*=\s*["'](?:Type|Type_Name)["'][\s\S]*?text\s*=\s*["']([\s\S]*?)["']\s*\)/i);
  if (type) return { kind: "type", text: type[1] };
  if (/do\s*\(\s*action\s*=\s*["']Back["']/i.test(content)) return { kind: "back" };
  const wait = content.match(/do\s*\(\s*action\s*=\s*["']Wait["'][\s\S]*?duration\s*=\s*["']?([\d.]+)/i);
  if (wait) return { kind: "wait", seconds: Math.min(5, Math.max(0.5, Number(wait[1]))) };
  return { kind: "wait", seconds: 1 };
}

export async function requestPhoneAgentStep(image: Buffer, task: string, currentApp: string, platform = currentApp) {
  const mime = image[0] === 0xff && image[1] === 0xd8 ? "image/jpeg" : "image/png";
  const response = await requestAutoGlm([
    {
      role: "system",
      content: `你是手机操作 Agent。每次只输出一个操作，严格使用 do(action=...) 或 finish(message=...) 格式。Tap/Swipe 坐标必须是 0 到 999 的屏幕归一化坐标。不要猜测帖子 ID；任务只在 ${platform} 内执行，不要点赞、评论、关注、购买或发布。`,
    },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:${mime};base64,${image.toString("base64")}` } },
        { type: "text", text: `${task}\n当前应用：${currentApp}\n如果已经完成复制链接，请输出 finish(message="copied")。` },
      ],
    },
  ], 300, 90_000);
  const content = response.choices?.[0]?.message?.content ?? "";
  return { action: parsePhoneAction(content), rawContent: content, requestId: response.id };
}

export async function testAutoGlmProvider() {
  const status = autoGlmProviderStatus();
  if (!status.configured) return { ...status, ok: false, message: "未检测到 ZHIPU_API_KEY，尚未发起网络请求" };
  const startedAt = performance.now();
  const response = await requestAutoGlm([
    { role: "system", content: "你是手机操作模型。只需确认当前测试画面可读取，然后输出 finish(message=\"ready\")。" },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: TEST_IMAGE_URL } },
        { type: "text", text: "连通性测试。{\"current_app\":\"provider-test\"}" },
      ],
    },
  ], 80);
  return {
    ...status,
    ok: true,
    latencyMs: Math.round(performance.now() - startedAt),
    requestId: response.id,
    usage: response.usage ? {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
    } : undefined,
    message: "智谱 AutoGLM-Phone 已返回有效响应",
  };
}
