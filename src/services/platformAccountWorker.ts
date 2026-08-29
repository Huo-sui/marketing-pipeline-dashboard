export type DetectedIdentity = {
  externalUserId?: string;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  profileUrl: string;
  detectedAt: string;
};

export type PlatformLoginSession = {
  accountId: string;
  platform: string;
  profileRef: string;
  browserOpen: boolean;
  state: "idle" | "waiting_for_login" | "identity_detected" | "error";
  identity?: DetectedIdentity;
  error?: string;
  provider?: string;
  deviceId?: string;
  deviceModel?: string;
  appPackage?: string;
};

async function requestSession(platform: string, accountId: string, action: "session" | "open" | "inspect" | "close", method: "GET" | "POST", body?: unknown) {
  let response: Response;
  try {
    response = await fetch(`/api/platform-accounts/${encodeURIComponent(platform)}/${encodeURIComponent(accountId)}/${action}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error("本地平台 Worker 未运行，请确认 Dashboard 服务已启动"); }
  const payload = await response.json() as PlatformLoginSession & { error?: string };
  if (!response.ok) throw new Error(payload.error || `${platform} 手机 Worker 不可用`);
  return payload;
}

export const platformAccountWorker = {
  getSession: (platform: string, accountId: string) => requestSession(platform, accountId, "session", "GET"),
  open: (platform: string, accountId: string, deviceId?: string) => requestSession(platform, accountId, "open", "POST", deviceId ? { deviceId } : undefined),
  inspect: (platform: string, accountId: string, deviceId?: string) => requestSession(platform, accountId, "inspect", "POST", deviceId ? { deviceId } : undefined),
  close: (platform: string, accountId: string) => requestSession(platform, accountId, "close", "POST"),
};
