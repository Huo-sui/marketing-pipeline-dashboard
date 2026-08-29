export type TikTokDetectedIdentity = {
  externalUserId?: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  profileUrl: string;
  detectedAt: string;
};

export type TikTokDevice = {
  serial: string;
  state: "device" | "offline" | "unauthorized" | "unknown";
  model?: string;
  product?: string;
  appInstalled: boolean;
};

export type TikTokLoginSession = {
  accountId: string;
  profileRef: string;
  browserOpen: boolean;
  state: "idle" | "waiting_for_login" | "identity_detected" | "error";
  identity?: TikTokDetectedIdentity;
  error?: string;
  provider?: "adb_uiautomator2";
  deviceId?: string;
  deviceModel?: string;
  appPackage?: string;
};

async function requestSession(accountId: string, action: "session" | "open" | "inspect" | "close", method: "GET" | "POST", body?: unknown) {
  let response: Response;
  try {
    response = await fetch(`/api/tiktok-accounts/${encodeURIComponent(accountId)}/${action}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("本地手机服务未运行。Dashboard、Control API 和手机 Worker 必须保持启动。请刷新页面后重试。");
  }
  const payload = await response.json() as TikTokLoginSession;
  if (response.status >= 500) throw new Error(payload.error || "TikTok 手机 Worker 不可用");
  return payload;
}

export const tiktokAccountWorker = {
  getSession: (accountId: string) => requestSession(accountId, "session", "GET"),
  open: (accountId: string, deviceId?: string) => requestSession(accountId, "open", "POST", deviceId ? { deviceId } : undefined),
  inspect: (accountId: string, deviceId?: string) => requestSession(accountId, "inspect", "POST", deviceId ? { deviceId } : undefined),
  close: (accountId: string) => requestSession(accountId, "close", "POST"),
};
