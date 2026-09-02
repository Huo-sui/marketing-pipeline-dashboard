import { execFile } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { requestPhoneAgentStep } from "./providers/zhipuAutoGlmProvider.js";
import { resolveAdbExecutable } from "./mobile/androidToolchain.js";
import { runDiscoveryStateMachine, type DiscoveryMachineContext, type PlatformDiscoveryPlan, type PlatformDiscoveryRequest } from "./mobile/discoveryStateMachine.js";
import { TIKTOK_DISCOVERY_POLICY, tiktokExternalIdFromUrl, tiktokMediaTypeFromUrl, tiktokSearchCandidates, type TikTokSearchCandidate } from "./platforms/tiktokDiscoveryPolicy.js";

const execFileAsync = promisify(execFile);
const TIKTOK_PACKAGE = "com.zhiliaoapp.musically";
const XHS_PACKAGE = "com.xingin.xhs";
const sessions = new Map<string, LoginSession>();
const platformSessions = new Map<string, LoginSession>();
const appiumSessions = new Map<string, string>();
const appiumDeviceQueues = new Map<string, Promise<void>>();
const appiumBaseUrl = (process.env.APPIUM_URL ?? "http://127.0.0.1:4723/wd/hub").replace(/\/$/, "");

type TikTokIdentity = {
  externalUserId?: string;
  handle: string;
  displayName: string;
  profileUrl: string;
  detectedAt: string;
};

type Device = {
  serial: string;
  state: "device" | "offline" | "unauthorized" | "unknown";
  model?: string;
  product?: string;
  appInstalled: boolean;
};

type LoginSession = {
  deviceId?: string;
  device?: Device;
  state: "idle" | "waiting_for_login" | "identity_detected" | "error";
  identity?: TikTokIdentity;
  error?: string;
  lastCheckedAt?: string;
};

export type TikTokDiscoveryPost = {
  externalId: string;
  canonicalUrl: string;
  author: string;
  title: string;
  likes: number;
  comments: number;
  publishedAt: string;
  mediaType: "视频" | "图文";
  term: string;
  rawPayload: Record<string, unknown>;
  coverEvidence: { bytes: Buffer; mimeType: "image/png"; capturedAt: string; source: "device_screenshot" };
};

export type TikTokDiscoveryLog = {
  timestamp: string;
  level: "info" | "warn" | "error";
  eventType: string;
  message: string;
  term?: string;
  page?: number;
  payload?: Record<string, unknown>;
};

export type TikTokDiscoveryResult = {
  posts: TikTokDiscoveryPost[];
  logs: TikTokDiscoveryLog[];
};

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function adb(args: string[], maxBuffer = 2_000_000) {
  return (await execFileAsync(resolveAdbExecutable(), args, {
    windowsHide: true,
    maxBuffer,
    // uiautomator can wait forever for an idle window while TikTok is playing
    // a full-screen animation. A bounded command keeps the API responsive.
    timeout: 8_000,
    killSignal: "SIGKILL",
  })).stdout;
}

function deviceArgs(serial?: string) {
  if (!serial) return [];
  if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(serial)) throw new Error("设备序列号格式无效");
  return ["-s", serial];
}

async function listDevices(): Promise<Device[]> {
  return listDevicesForPackage(TIKTOK_PACKAGE);
}

async function listDevicesForPackage(packageName: string): Promise<Device[]> {
  let output: string;
  try {
    output = await adb(["devices", "-l"]);
  } catch {
    return [];
  }
  const devices: Device[] = [];
  for (const line of output.split(/\r?\n/).slice(1)) {
    const match = line.trim().match(/^([^\s]+)\s+(device|offline|unauthorized|unknown)(?:\s+(.*))?$/);
    if (!match) continue;
    const details = match[3] ?? "";
    const model = details.match(/model:([^\s]+)/)?.[1]?.replace(/_/g, " ");
    const product = details.match(/product:([^\s]+)/)?.[1];
    const state = match[2] as Device["state"];
    let appInstalled = false;
    if (state === "device") {
      try { appInstalled = (await adb([...deviceArgs(match[1]), "shell", "pm", "path", packageName])).includes(packageName); } catch { /* device disappeared */ }
    }
    devices.push({ serial: match[1], state, model, product, appInstalled });
  }
  return devices;
}

async function selectDeviceForPackage(requested: string | undefined, packageName: string, label: string) {
  const devices = await listDevicesForPackage(packageName);
  const device = requested ? devices.find((item) => item.serial === requested) : devices.find((item) => item.state === "device");
  if (!device) throw new Error(requested ? `找不到设备 ${requested}` : "没有检测到已授权的 Android 手机");
  if (device.state !== "device") throw new Error(`设备 ${device.serial} 当前状态为 ${device.state}，请确认 USB 调试授权`);
  if (!device.appInstalled) throw new Error(`设备上没有安装${label}，请先安装并登录`);
  return device;
}

async function selectDevice(requested?: string) {
  const devices = await listDevices();
  const device = requested ? devices.find((item) => item.serial === requested) : devices.find((item) => item.state === "device");
  if (!device) throw new Error(requested
    ? `找不到设备 ${requested}。请解锁手机、重新插拔 USB，并确认 USB 调试授权后再运行。`
    : "没有检测到已授权的 Android 手机。请解锁手机并确认 USB 调试授权。");
  if (device.state !== "device") throw new Error(`设备 ${device.serial} 当前状态为 ${device.state}，请解锁手机并确认 USB 调试授权`);
  if (!device.appInstalled) throw new Error("设备上没有安装 TikTok，请先在手机上安装并登录");
  return device;
}

function sessionPayloadFor(platform: string, appPackage: string, accountId: string, session: LoginSession) {
  return {
    accountId,
    platform,
    profileRef: session.deviceId ? `android://${session.deviceId}/${appPackage}` : "android://unassigned",
    provider: "adb_uiautomator2" as const,
    deviceId: session.deviceId,
    deviceModel: session.device?.model,
    appPackage,
    browserOpen: Boolean(session.deviceId),
    state: session.state,
    identity: session.identity,
    error: session.error,
  };
}

async function ensureDeviceUnlocked(device: Device) {
  const windowState = await adb([...deviceArgs(device.serial), "shell", "dumpsys", "window"], 500_000).catch(() => "");
  if (/isKeyguardShowing=true|mDreamingLockscreen=true/.test(windowState)) {
    throw new Error("OPPO 手机当前处于锁屏状态，请先在手机上解锁后再运行 TikTok 话题雷达");
  }
}

async function launchTikTok(device: Device) {
  await ensureDeviceUnlocked(device);
  await adb([...deviceArgs(device.serial), "shell", "am", "force-stop", TIKTOK_PACKAGE]);
  await adb([...deviceArgs(device.serial), "shell", "monkey", "-p", TIKTOK_PACKAGE, "1"]);
  // TikTok may spend several seconds in SplashActivity while restoring the
  // already-authenticated session. Do not send coordinate taps until the
  // actual home UI is exposed; fixed sleeps are unreliable on this phone.
  // ColorOS reports TikTok's launcher alias before the first real frame, and
  // the first Appium session may spend ~20-30s initializing UiAutomator2.
  // Include that one-time bridge startup in the readiness window.
  await new Promise((resolve) => setTimeout(resolve, 8_000));
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const xml = await dumpUi(device).catch(() => "");
    const tikTokUiReady = xml.includes(`package="${TIKTOK_PACKAGE}"`)
      && !/SplashActivity|启动中|加载中/.test(xml)
      && !/com\.android\.systemui|keyguard_root/.test(xml);
    if (tikTokUiReady || /推荐|首页|user_avatar|关注|主页/.test(xml)) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("TikTok 启动后 90 秒仍未暴露可交互首页 UI；请确认手机已解锁且 TikTok 首页可正常加载");
}

async function dumpUiDirect(device: Device) {
  await adb([...deviceArgs(device.serial), "shell", "uiautomator", "dump", "/sdcard/marketing-pipeline-window.xml"], 500_000).catch(() => undefined);
  return adb([...deviceArgs(device.serial), "shell", "cat", "/sdcard/marketing-pipeline-window.xml"], 2_000_000).catch(() => "");
}

async function launchXhs(device: Device) {
  await ensureDeviceUnlocked(device);
  await adb([...deviceArgs(device.serial), "shell", "am", "force-stop", XHS_PACKAGE]);
  await adb([...deviceArgs(device.serial), "shell", "monkey", "-p", XHS_PACKAGE, "1"]);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const xml = await dumpUiDirect(device);
    if (!xml.includes(XHS_PACKAGE)) { await new Promise((resolve) => setTimeout(resolve, 800)); continue; }
    const dismissed = await tapText(device, xml, ["不再提醒", "关闭", "我知道了"]);
    if (dismissed) { await new Promise((resolve) => setTimeout(resolve, 800)); continue; }
    return;
  }
  throw new Error("小红书启动后未暴露可交互 UI，请确认手机已解锁");
}

function xhsIdentityFromUi(xml: string): TikTokIdentity | null {
  if (!xml.includes(`package="${XHS_PACKAGE}"`)) return null;
  const id = xml.match(/小红书号：\s*([A-Za-z0-9_-]+)/)?.[1];
  const avatar = xml.match(/content-desc="头像,([^"]+)"/)?.[1];
  const displayName = avatar || xml.match(/text="([^"]+)"[^>]*class="android\.widget\.TextView"/)?.[1];
  if (!id || !displayName || /登录|注册/.test(xml)) return null;
  return { externalUserId: id, handle: id, displayName, profileUrl: `https://www.xiaohongshu.com/user/profile/${id}`, detectedAt: new Date().toISOString() };
}

async function inspectXhs(device: Device) {
  await launchXhs(device);
  const size = await screenSize(device).catch(() => ({ width: 2268, height: 2440 }));
  await adb([...deviceArgs(device.serial), "shell", "input", "tap", String(Math.round(size.width * 0.9)), String(Math.round(size.height * 0.95))]).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const xml = await dumpUiDirect(device);
    const identity = xhsIdentityFromUi(xml);
    if (identity) return identity;
    const dismissed = await tapText(device, xml, ["不再提醒", "关闭", "我知道了"]);
    if (!dismissed) await new Promise((resolve) => setTimeout(resolve, 900));
  }
  return null;
}

async function dumpUi(device: Device) {
  // Android exposes one UI Automation service per device. Every source call
  // must be serialized with clipboard and element calls, otherwise Appium can
  // queue requests until its default 60-second command timeout kills the
  // session. Never fall back to `adb shell uiautomator dump`: that starts a
  // second UI Automation client and causes the same race.
  return withAppiumDeviceQueue(device.serial, async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const appiumSession = await ensureAppiumSession(device).catch(() => "");
      if (!appiumSession) return "";
      try {
        const response = await fetch(`${appiumBaseUrl}/session/${appiumSession}/source`, { signal: AbortSignal.timeout(30_000) });
        if (response.status === 404) {
          appiumSessions.delete(device.serial);
          continue;
        }
        if (response.ok) {
          const payload = await response.json() as { value?: unknown };
          if (typeof payload.value === "string" && payload.value.includes("<hierarchy")) return normalizeUiSource(payload.value);
        }
      } catch { /* retry once with a fresh Appium session */ }
      appiumSessions.delete(device.serial);
    }
    return "";
  });
}

async function withAppiumDeviceQueue<T>(serial: string, operation: () => Promise<T>): Promise<T> {
  const previous = appiumDeviceQueues.get(serial) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  appiumDeviceQueues.set(serial, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (appiumDeviceQueues.get(serial) === queued) appiumDeviceQueues.delete(serial);
  }
}

function normalizeUiSource(xml: string) {
  // ADB uiautomator emits <node>; Appium UiAutomator2 emits concrete Android
  // widget tags. Both carry the same attributes, so normalize only the tag
  // names and keep the existing, deliberately small XML parser unchanged.
  return xml
    .replace(/<android\.[^\s>]+/g, "<node")
    .replace(/<\/android\.[^>]+>/g, "</node>");
}

async function screenshot(device: Device) {
  const result = await execFileAsync(resolveAdbExecutable(), [...deviceArgs(device.serial), "exec-out", "screencap", "-p"], { windowsHide: true, maxBuffer: 12_000_000, timeout: 12_000, killSignal: "SIGKILL", encoding: "buffer" as never });
  const image = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout as unknown as string, "binary");
  const pngOffset = image.indexOf(Buffer.from("89504e470d0a1a0a", "hex"));
  if (pngOffset < 0) throw new Error("TikTok 截图没有返回有效 PNG");
  return image.subarray(pngOffset);
}

async function modelScreenshot(device: Device) {
  const original = await screenshot(device);
  if (process.platform !== "win32" || original.length < 500_000) return original;
  const stem = `${tmpdir()}\\marketing-pipeline-${randomUUID()}`;
  const inputPath = `${stem}.png`;
  const outputPath = `${stem}.jpg`;
  try {
    await writeFile(inputPath, original);
    const script = [
      "Add-Type -AssemblyName System.Drawing",
      `$src=[System.Drawing.Image]::FromFile('${inputPath.replace(/'/g, "''")}')`,
      "$width=720",
      "$height=[int]($src.Height * $width / $src.Width)",
      "$dst=New-Object System.Drawing.Bitmap($width,$height)",
      "$g=[System.Drawing.Graphics]::FromImage($dst)",
      "$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic",
      "$g.DrawImage($src,0,0,$width,$height)",
      `$dst.Save('${outputPath.replace(/'/g, "''")}',[System.Drawing.Imaging.ImageFormat]::Jpeg)`,
      "$g.Dispose(); $dst.Dispose(); $src.Dispose()",
    ].join("; ");
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 15_000, maxBuffer: 200_000 });
    const resized = await readFile(outputPath);
    return resized.length < original.length ? resized : original;
  } catch {
    return original;
  } finally {
    await Promise.all([unlink(inputPath).catch(() => undefined), unlink(outputPath).catch(() => undefined)]);
  }
}

async function screenSize(device: Device) {
  const value = await adb([...deviceArgs(device.serial), "shell", "wm", "size"]);
  const match = value.match(/Physical size:\s*(\d+)x(\d+)/);
  return { width: Number(match?.[1] ?? 1116), height: Number(match?.[2] ?? 2484) };
}

async function isTikTokDetailActivity(device: Device) {
  const activity = await adb([...deviceArgs(device.serial), "shell", "dumpsys", "activity", "activities"], 500_000).catch(() => "");
  return /topResumedActivity=.*com\.zhiliaoapp\.musically\/com\.ss\.android\.ugc\.aweme\.detail\.ui\.DetailActivity|ResumedActivity:.*com\.zhiliaoapp\.musically\/com\.ss\.android\.ugc\.aweme\.detail\.ui\.DetailActivity/.test(activity);
}

function normalizedPoint(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value / 999 * max)));
}

function shellInputText(value: string) {
  // Android input text uses percent escapes for spaces and a small set of
  // punctuation. Search terms are controlled by the project configuration;
  // remove shell metacharacters before handing them to ADB.
  return value.replace(/[\\"'&;|<>$`]/g, "").replace(/ /g, "%s");
}

async function readClipboard(device: Device) {
  return withAppiumDeviceQueue(device.serial, async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const appiumSession = await ensureAppiumSession(device).catch(() => "");
      if (!appiumSession) break;
      try {
        const response = await fetch(`${appiumBaseUrl}/session/${appiumSession}/appium/device/get_clipboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: "plaintext" }),
          signal: AbortSignal.timeout(12_000),
        });
        if (response.status === 404) {
          appiumSessions.delete(device.serial);
          continue;
        }
        if (response.ok) {
          const payload = await response.json() as { value?: unknown };
          if (typeof payload.value === "string") {
            // Appium's clipboard endpoint returns the clipboard bytes as a
            // Base64 string, even when contentType is plaintext.
            try {
              const decoded = Buffer.from(payload.value, "base64").toString("utf8");
              if (/^https?:\/\//i.test(decoded) || decoded.trim() === "") return decoded.replace(/[\r\n]/g, " ").trim();
            } catch { /* use the raw value below */ }
            return payload.value.replace(/[\r\n]/g, " ").trim();
          }
        }
      } catch { /* retry with a fresh session below */ }
      appiumSessions.delete(device.serial);
    }
    const output = await adb([...deviceArgs(device.serial), "shell", "cmd", "clipboard", "get"], 200_000).catch(() => "");
    if (/No shell command implementation|unknown command/i.test(output)) return "";
    return output.replace(/[\r\n]/g, " ").trim();
  });
}

async function clearClipboard(device: Device) {
  await withAppiumDeviceQueue(device.serial, async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const appiumSession = await ensureAppiumSession(device).catch(() => "");
      if (!appiumSession) break;
      try {
        const response = await fetch(`${appiumBaseUrl}/session/${appiumSession}/appium/device/set_clipboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "", contentType: "plaintext" }),
          signal: AbortSignal.timeout(12_000),
        });
        if (response.status === 404) {
          appiumSessions.delete(device.serial);
          continue;
        }
        if (response.ok) return;
      } catch { /* retry with a fresh session below */ }
      appiumSessions.delete(device.serial);
    }
    await adb([...deviceArgs(device.serial), "shell", "cmd", "clipboard", "clear"], 200_000).catch(() => undefined);
  });
}

async function ensureAppiumSession(device: Device) {
  const existing = appiumSessions.get(device.serial);
  if (existing) return existing;
  const body = {
    capabilities: {
      alwaysMatch: {
        platformName: "Android",
        "appium:automationName": "UiAutomator2",
        "appium:udid": device.serial,
        "appium:noReset": true,
        "appium:skipDeviceInitialization": true,
        "appium:appPackage": TIKTOK_PACKAGE,
        "appium:newCommandTimeout": 600,
        "appium:uiautomator2ServerLaunchTimeout": 60_000,
        "appium:uiautomator2ServerInstallTimeout": 60_000,
      },
      firstMatch: [{}],
    },
  };
  const response = await fetch(`${appiumBaseUrl}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Appium session 创建失败 (${response.status})`);
  const payload = await response.json() as { value?: { sessionId?: string }; sessionId?: string };
  const sessionId = payload.value?.sessionId ?? payload.sessionId;
  if (!sessionId) throw new Error("Appium 响应中没有 sessionId");
  appiumSessions.set(device.serial, sessionId);
  return sessionId;
}

async function resolveTikTokUrl(rawUrl: string) {
  const trimmed = rawUrl.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[),.]+$/, "") ?? "";
  if (!trimmed || !/tiktok\.com/i.test(trimmed)) return null;
  let canonicalUrl = trimmed;
  let externalId = tiktokExternalIdFromUrl(canonicalUrl);
  if (!externalId) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(trimmed, { redirect: "follow", signal: controller.signal });
      clearTimeout(timeout);
      canonicalUrl = response.url || trimmed;
      externalId = tiktokExternalIdFromUrl(canonicalUrl);
    } catch { /* short links may be inaccessible from this machine */ }
  }
  if (!externalId) return null;
  const mediaType = tiktokMediaTypeFromUrl(canonicalUrl);
  if (!mediaType) return null;
  return { canonicalUrl, externalId, mediaType };
}

async function waitForTikTokClipboard(device: Device, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const raw = await readClipboard(device);
    const resolved = await resolveTikTokUrl(raw);
    if (resolved) return { ...resolved, rawClipboard: raw };
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  return null;
}

async function executePhoneAction(device: Device, action: Awaited<ReturnType<typeof requestPhoneAgentStep>>["action"]) {
  const size = await screenSize(device);
  if (action.kind === "tap") {
    await adb([...deviceArgs(device.serial), "shell", "input", "tap", String(normalizedPoint(action.x, size.width)), String(normalizedPoint(action.y, size.height))]);
  } else if (action.kind === "swipe") {
    await adb([...deviceArgs(device.serial), "shell", "input", "swipe", String(normalizedPoint(action.startX, size.width)), String(normalizedPoint(action.startY, size.height)), String(normalizedPoint(action.endX, size.width)), String(normalizedPoint(action.endY, size.height)), "500"]);
  } else if (action.kind === "type") {
    await adb([...deviceArgs(device.serial), "shell", "input", "text", shellInputText(action.text)]);
  } else if (action.kind === "back") {
    await adb([...deviceArgs(device.serial), "shell", "input", "keyevent", "4"]);
  } else if (action.kind === "wait") {
    await new Promise((resolve) => setTimeout(resolve, action.seconds * 1000));
  }
  if (action.kind !== "wait") await new Promise((resolve) => setTimeout(resolve, 1200));
}

async function copyPostLinkWithAgent(device: Device, term: string) {
  const task = `在 TikTok 当前页面完成采集任务：找到与“${term}”相关、互动数据明显的一个视频，打开它，点击分享按钮，在分享面板点击“复制链接”。不要点赞、评论、关注或发布。`;
  let lastAction = "";
  await clearClipboard(device);
  // The detail page normally exposes both actions through UiAutomator, but
  // the tree can lag briefly after opening a card. Poll it before spending a
  // costly visual-model request.
  let shareTapped = false;
  for (let attempt = 0; attempt < 3 && !shareTapped; attempt += 1) {
    shareTapped = await tapDescriptionPattern(device, /分享视频|Share video/i);
    if (!shareTapped) await new Promise((resolve) => setTimeout(resolve, 700));
  }
  if (!shareTapped && await isTikTokDetailActivity(device)) {
    const size = await screenSize(device);
    await adb([...deviceArgs(device.serial), "shell", "input", "tap", String(Math.round(size.width * 0.913)), String(Math.round(size.height * 0.795))]);
    await new Promise((resolve) => setTimeout(resolve, 1_800));
    shareTapped = true;
  }
  let copyTapped = false;
  for (let attempt = 0; attempt < 5 && !copyTapped; attempt += 1) {
    copyTapped = await tapDescriptionPattern(device, /复制链接|Copy link/i) || await tapDescriptionPattern(device, /复制链接/);
    if (!copyTapped) await new Promise((resolve) => setTimeout(resolve, 700));
  }
  if (shareTapped && !copyTapped && await isTikTokDetailActivity(device)) {
    const size = await screenSize(device);
    await adb([...deviceArgs(device.serial), "shell", "input", "tap", String(Math.round(size.width * 0.308)), String(Math.round(size.height * 0.785))]);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    copyTapped = true;
  }
  if (shareTapped && copyTapped) {
    const copied = await waitForTikTokClipboard(device);
    if (copied) return { ...copied, step: 0 };
    throw new Error("TikTok 已触发复制链接，但 Appium 剪贴板没有返回可解析的真实 TikTok URL");
  }
  for (let step = 0; step < 10; step += 1) {
    const clipboardBefore = await readClipboard(device);
    const beforeResolved = await resolveTikTokUrl(clipboardBefore);
    if (beforeResolved) return { ...beforeResolved, rawClipboard: clipboardBefore, step };
    const agentImage = await modelScreenshot(device);
    let result: Awaited<ReturnType<typeof requestPhoneAgentStep>>;
    try {
      result = await requestPhoneAgentStep(agentImage, task, "TikTok");
    } catch {
      // Vision inference can occasionally time out while TikTok is animating
      // a transition. Re-read the screen once before failing the whole run.
      await new Promise((resolve) => setTimeout(resolve, 800));
      try {
        result = await requestPhoneAgentStep(await modelScreenshot(device), task, "TikTok");
      } catch (retryError) {
        const detail = retryError instanceof Error ? retryError.message : "视觉请求失败";
        throw new Error(`AutoGLM 第 ${step + 1} 步失败：${detail}`);
      }
    }
    lastAction = result.rawContent.slice(0, 300);
    if (result.action.kind === "finish") {
      const copied = await waitForTikTokClipboard(device, 3_000);
      if (copied) return { ...copied, step };
      await new Promise((resolve) => setTimeout(resolve, 800));
      continue;
    }
    await executePhoneAction(device, result.action);
    const copied = await waitForTikTokClipboard(device, 3_000);
    if (copied) return { ...copied, step };
  }
  throw new Error(`AutoGLM 经过 10 步仍未复制 TikTok 真实链接（${lastAction || "无动作响应"}）`);
}

async function tapDescriptionPattern(device: Device, pattern: RegExp) {
  const xml = await dumpUi(device).catch(() => "");
  for (const node of xml.matchAll(/<node\b[^>]*>/g)) {
    const tag = node[0];
    const description = decodeXml(tag.match(/\bcontent-desc="([^"]*)"/)?.[1] ?? "");
    const bounds = tag.match(/\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!description || !pattern.test(description) || !bounds) continue;
    const x = Math.round((Number(bounds[1]) + Number(bounds[3])) / 2);
    const y = Math.round((Number(bounds[2]) + Number(bounds[4])) / 2);
    await adb([...deviceArgs(device.serial), "shell", "input", "tap", String(x), String(y)]);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return true;
  }
  return false;
}

function decodeXml(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function uiNodes(xml: string) {
  return [...xml.matchAll(/<node\b[^>]*>/g)].map((match) => {
    const tag = match[0];
    const text = decodeXml(tag.match(/\btext="([^"]*)"/)?.[1] ?? "");
    const desc = decodeXml(tag.match(/\bcontent-desc="([^"]*)"/)?.[1] ?? "");
    const bounds = tag.match(/\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    return { text, desc, selected: tag.match(/\bselected="([^"]*)"/)?.[1] === "true", checked: tag.match(/\bchecked="([^"]*)"/)?.[1] === "true", bounds: bounds ? { left: Number(bounds[1]), top: Number(bounds[2]), right: Number(bounds[3]), bottom: Number(bounds[4]) } : undefined };
  }).filter((node) => node.text || node.desc);
}

function parseMetric(value: string) {
  const normalized = value.replace(/,/g, "").trim().toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*([万wk])?/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2];
  return Math.round(amount * (unit === "万" ? 10_000 : unit === "w" ? 10_000 : unit === "k" ? 1_000 : 1));
}

function parseLabeledMetric(xml: string, pattern: RegExp) {
  for (const match of xml.matchAll(/content-desc="([^"]*)"/g)) {
    const description = decodeXml(match[1]);
    const labeled = description.match(pattern);
    if (!labeled) continue;
    const value = parseMetric(labeled[1]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function parsePublishedAt(xml: string) {
  const values = [
    ...xmlValues(xml, "text"),
    ...xmlValues(xml, "content-desc"),
  ];
  for (const value of values) {
    const relative = value.match(/^(刚刚|(?:约)?(\d+)\s*(秒|分钟|小时|天|周)前|(?:about\s*)?(\d+)\s*(s|m|h|d|w)\s*ago)$/i);
    if (relative) {
      if (relative[1] === "刚刚") return new Date().toISOString();
      const amount = Number(relative[2] ?? relative[4] ?? 0);
      const unit = (relative[3] ?? relative[5] ?? "").toLowerCase();
      const multiplier = unit === "秒" || unit === "s" ? 1_000 : unit === "分钟" || unit === "m" ? 60_000 : unit === "小时" || unit === "h" ? 3_600_000 : unit === "天" || unit === "d" ? 86_400_000 : 604_800_000;
      return new Date(Date.now() - amount * multiplier).toISOString();
    }
    const match = value.match(/(?:^|[·|\s])((\d{4})[-/.](\d{1,2})[-/.](\d{1,2})|((\d{1,2})月(\d{1,2})日)|((\d{1,2})[-/.](\d{1,2})))(?:$|\s)/);
    if (!match) continue;
    const year = Number(match[2] ?? new Date().getFullYear());
    const month = Number(match[3] ?? match[6] ?? match[9]);
    const day = Number(match[4] ?? match[7] ?? match[10]);
    if (!month || !day || month > 12 || day > 31) continue;
    // TikTok omits the year for recent posts. If a month/day would be in the
    // future, it belongs to the previous calendar year.
    const now = new Date();
    const inferredYear = match[2] ? year : (month > now.getMonth() + 1 || (month === now.getMonth() + 1 && day > now.getDate()) ? year - 1 : year);
    const timestamp = Date.UTC(inferredYear, month - 1, day);
    const parsed = new Date(timestamp);
    if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) continue;
    return parsed.toISOString();
  }
  return undefined;
}

function parseOpenedPostMetadata(xml: string) {
  const nodes = uiNodes(xml);
  const values = nodes.flatMap((node) => [node.text, node.desc]).filter(Boolean);
  const author = values.find((value) => /^@[a-zA-Z0-9._-]{2,64}$/.test(value)) ?? "";
  const title = values
    .filter((value) => value.length >= 4 && !/^\d/.test(value) && !/^[@#]/.test(value) && !/^(赞|评论|分享|Like|Comment|Share)$/i.test(value))
    .sort((left, right) => right.length - left.length)[0];
  // Prefer semantic accessibility descriptions. Numeric nodes are duplicated
  // in TikTok's hierarchy, so positional parsing can turn likes into comments.
  const likes = parseLabeledMetric(xml, /(?:点赞视频|like video)[^\d]*(\d[\d.,]*\s*[万wk]?)/i);
  const comments = parseLabeledMetric(xml, /(?:评论|comment)[^\d]*(\d[\d.,]*\s*[万wk]?)/i);
  return { author, title, likes, comments, publishedAt: parsePublishedAt(xml) };
}

async function openSearch(device: Device, term: string) {
  let xml = await dumpUi(device).catch(() => "");
  let tapped = await tapText(device, xml, ["搜索", "Search", "ค้นหา", "发现", "Discover"]);
  if (!tapped) {
    const size = await adb([...deviceArgs(device.serial), "shell", "wm", "size"]);
    const match = size.match(/Physical size:\s*(\d+)x(\d+)/);
    const width = Number(match?.[1] ?? 1116);
    const height = Number(match?.[2] ?? 2484);
    // TikTok's search affordance is top-right on the feed, but its label is
    // frequently omitted from the accessibility tree on Android builds.
    await adb([...deviceArgs(device.serial), "shell", "input", "tap", String(Math.round(width * 0.92)), String(Math.round(height * 0.075))]);
    tapped = true;
  }
  // Wait for TikTok's search EditText rather than assuming the tap landed.
  // On ColorOS the first dump after opening the search page can be empty.
  let inputTapped = false;
  const inputDeadline = Date.now() + 8_000;
  while (Date.now() < inputDeadline && !inputTapped) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    xml = await dumpUi(device).catch(() => "");
    inputTapped = await tapText(device, xml, ["搜索", "Search", "搜索内容"]);
    if (!inputTapped && /resource-id="[^"]*(?:ho3|search)[^"]*"/.test(xml)) {
      const match = xml.match(/<node\b(?=[^>]*resource-id="[^"]*(?:ho3|search)[^"]*")(?=[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]")[^>]*>/i);
      if (match) {
        await adb([...deviceArgs(device.serial), "shell", "input", "tap", String(Math.round((Number(match[1]) + Number(match[3])) / 2)), String(Math.round((Number(match[2]) + Number(match[4])) / 2))]);
        inputTapped = true;
      }
    }
  }
  if (!inputTapped) throw new Error(`追踪词 ${term}：TikTok 搜索框在 8 秒内没有进入可输入状态`);
  await adb([...deviceArgs(device.serial), "shell", "input", "text", term.replace(/ /g, "%s")]);
  await adb([...deviceArgs(device.serial), "shell", "input", "keyevent", "66"]);
  // TikTok renders the search grid after dismissing the keyboard. A short
  // fixed wait alone can capture the transition frame, which makes the phone
  // model spend its entire inference budget trying to interpret it.
  await new Promise((resolve) => setTimeout(resolve, 3500));
  const resultUi = await dumpUi(device).catch(() => "");
  if (resultUi && !resultUi.includes(`text="${term}"`) && !/resource-id="[^"]*v68[^"]*"/.test(resultUi)) {
    throw new Error(`追踪词 ${term}：关键词输入后 TikTok 没有进入对应结果页`);
  }
}

async function selectRecentUploadSort(device: Device) {
  let xml = await dumpUi(device).catch(() => "");
  const opened = await tapText(device, xml, ["筛选", "Filter", "Filters", "排序", "Sort"])
    || await tapDescriptionPattern(device, /filter|sort|筛选|排序/i);
  if (!opened) return false;
  await new Promise((resolve) => setTimeout(resolve, 900));
  xml = await dumpUi(device).catch(() => "");
  const labels = new Set(["最近上传", "最近发布", "最新", "Latest", "Newest", "Most recent"]);
  const option = uiNodes(xml).find((node) => node.bounds && labels.has(node.text || node.desc));
  if (!option?.bounds) return false;
  const centerX = (option.bounds.left + option.bounds.right) / 2;
  const centerY = (option.bounds.top + option.bounds.bottom) / 2;
  await adb([...deviceArgs(device.serial), "shell", "input", "tap", String(Math.round(centerX)), String(Math.round(centerY))]);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const verified = uiNodes(await dumpUi(device).catch(() => ""))
    .filter((node) => node.bounds && labels.has(node.text || node.desc))
    .sort((left, right) => Math.hypot(((left.bounds!.left + left.bounds!.right) / 2) - centerX, ((left.bounds!.top + left.bounds!.bottom) / 2) - centerY) - Math.hypot(((right.bounds!.left + right.bounds!.right) / 2) - centerX, ((right.bounds!.top + right.bounds!.bottom) / 2) - centerY))[0];
  return Boolean(verified?.selected || verified?.checked);
}

async function nextTikTokSearchCandidate(device: Device, visited: Set<string>) {
  const deadline = Date.now() + 18_000;
  let swipes = 0;
  while (Date.now() < deadline) {
    const xml = await dumpUi(device).catch(() => "");
    const cards = tiktokSearchCandidates(xml);
    const candidate = cards.find((card) => !visited.has(card.fingerprint));
    if (candidate) return candidate;
    if (cards.length && swipes < 2) {
      const size = await screenSize(device).catch(() => ({ width: 1116, height: 2484 }));
      await adb([...deviceArgs(device.serial), "shell", "input", "swipe", String(Math.round(size.width * 0.5)), String(Math.round(size.height * 0.76)), String(Math.round(size.width * 0.5)), String(Math.round(size.height * 0.28)), "500"]);
      swipes += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  return undefined;
}

async function returnToSearchResults(device: Device) {
  // Copy-link automation can leave either the share sheet or the detail page
  // active. Close one layer at a time and verify the actual result grid after
  // each Back instead of assuming a single key event is sufficient.
  for (let layer = 0; layer < 3; layer += 1) {
    await adb([...deviceArgs(device.serial), "shell", "input", "keyevent", "4"]);
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const xml = await dumpUi(device).catch(() => "");
      if (/resource-id="[^"]*v68[^"]*"/i.test(xml) && !/分享视频|Share video/i.test(xml)) return true;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  return false;
}

type TikTokMachinePlatform = {
  device: Device;
  seenIds: Set<string>;
  currentCard?: TikTokSearchCandidate;
  normalLaunches: number;
  recoveryLaunches: number;
};

async function restoreTikTokResults(context: DiscoveryMachineContext<TikTokDiscoveryPost, TikTokMachinePlatform>) {
  if (await returnToSearchResults(context.platform.device)) return;
  try {
    await openSearch(context.platform.device, context.term!);
    const sortRestored = await selectRecentUploadSort(context.platform.device).catch(() => false);
    context.log(sortRestored ? "info" : "warn", "results_reanchored", sortRestored ? "TikTok 已重新锚定同一追踪词并确认恢复“最近上传”" : "TikTok 已重新锚定同一追踪词，但未确认可选的“最近上传”", { recoveryRestartedApp: false, sortRestored });
  } catch {
    await launchTikTok(context.platform.device);
    context.platform.recoveryLaunches += 1;
    await openSearch(context.platform.device, context.term!);
    const sortRestored = await selectRecentUploadSort(context.platform.device).catch(() => false);
    context.log("warn", "results_reanchored", sortRestored ? "TikTok 结果页恢复失败后重启 App、重新搜索并确认恢复“最近上传”" : "TikTok 结果页恢复失败后重启 App 并重新搜索；未确认可选的“最近上传”", { recoveryRestartedApp: true, sortRestored });
  }
}

function tikTokPlan(): PlatformDiscoveryPlan<TikTokDiscoveryPost, TikTokMachinePlatform> {
  return {
    version: TIKTOK_DISCOVERY_POLICY.stateMachineVersion,
    session: [{ id: "tiktok_session_ready", state: "session_ready", required: true, timeout: 120_000, attempts: 2, async execute(context) { await launchTikTok(context.platform.device); context.platform.normalLaunches += 1; context.log("info", "app_session_started", "TikTok 本次运行正常启动一次", { normalLaunches: context.platform.normalLaunches }); }, recover: async (context) => { context.platform.recoveryLaunches += 1; context.log("warn", "session_recovery", "TikTok 首次启动未就绪，允许一次恢复启动", { recoveryLaunches: context.platform.recoveryLaunches }); } }],
    term: [
      { id: "tiktok_term_prepare", state: "term_prepare", required: true, timeout: 3_000, attempts: 1, async execute(context) { context.platform.seenIds = new Set<string>(); } },
      { id: "tiktok_query_submit", state: "query_submitted", required: true, timeout: 25_000, attempts: 2, async execute(context) { await openSearch(context.platform.device, context.term!); }, recover: async (context) => { await adb([...deviceArgs(context.platform.device.serial), "shell", "input", "keyevent", "4"]); } },
      { id: "tiktok_results_ready", state: "results_ready", required: true, timeout: 3_000, attempts: 1, async execute(context) { context.log("info", "results_verified", "沿用 TikTok 输入完成后的结果页确认", { verifiedBy: "query_submitted" }); } },
      { id: TIKTOK_DISCOVERY_POLICY.recentUpload.stepId, state: "filters_apply", required: TIKTOK_DISCOVERY_POLICY.recentUpload.required, timeout: 15_000, attempts: 1, async execute(context) { const selected = await selectRecentUploadSort(context.platform.device); context.log(selected ? "info" : "warn", "sort_selected", selected ? "已切换排序：最近上传" : "未能确认“最近上传”，沿用当前可选失败策略", { requested: "recent_upload", selected }); if (!selected) throw new Error("未确认最近上传"); } },
      { id: "tiktok_filter_verify", state: "filters_verify", required: false, timeout: 1_000, attempts: 1, async execute() {} },
    ],
    candidate: [
      { id: "tiktok_candidate_scan", state: "candidate_scan", required: true, timeout: 22_000, attempts: 1, async execute(context) { const card = await nextTikTokSearchCandidate(context.platform.device, context.visitedFingerprints); if (!card) throw new Error("TikTok 搜索结果没有更多未访问候选"); context.visitedFingerprints.add(card.fingerprint); context.platform.currentCard = card; context.log("info", "candidate_scanned", `按视觉顺序选择候选 ${context.candidateIndex + 1}`, { candidateIndex: context.candidateIndex, fingerprint: card.fingerprint }); } },
      { id: "tiktok_candidate_open", state: "candidate_open", required: true, timeout: 30_000, attempts: 1, async execute(context) { const bounds = context.platform.currentCard?.bounds; if (!bounds) throw new Error("TikTok 候选缺少可点击坐标"); await adb([...deviceArgs(context.platform.device.serial), "shell", "input", "tap", String(Math.round((bounds.left + bounds.right) / 2)), String(Math.round((bounds.top + bounds.bottom) / 2))]); await new Promise((resolve) => setTimeout(resolve, 2_500)); const xml = await dumpUi(context.platform.device).catch(() => ""); if (!/分享视频|Share video|评论|Comment/i.test(xml)) throw new Error("TikTok 候选详情页未确认"); }, recover: restoreTikTokResults },
      { id: "tiktok_candidate_extract", state: "candidate_extract", required: true, timeout: 75_000, attempts: 1, async execute(context) { const xml = await dumpUi(context.platform.device).catch(() => ""); const metadata = parseOpenedPostMetadata(xml); if (!metadata.author || !metadata.title || metadata.likes === undefined || metadata.comments === undefined || !metadata.publishedAt) throw new Error("字段清单未完成：作者、标题、点赞数、评论数或发布时间缺失"); const coverEvidence = { bytes: await screenshot(context.platform.device), mimeType: "image/png" as const, capturedAt: new Date().toISOString(), source: "device_screenshot" as const }; context.log("info", "candidate_read", `读取候选 ${context.candidateIndex + 1}：发布时间 ${metadata.publishedAt}，点赞 ${metadata.likes}，评论 ${metadata.comments}`, { candidate: context.candidateIndex + 1, likes: metadata.likes, comments: metadata.comments, publishedAt: metadata.publishedAt }); const link = await copyPostLinkWithAgent(context.platform.device, context.term!); if (context.platform.seenIds.has(link.externalId)) throw new Error("真实分享链接与已检查候选重复"); const post: TikTokDiscoveryPost = { externalId: link.externalId, canonicalUrl: link.canonicalUrl, author: metadata.author, title: metadata.title, likes: metadata.likes, comments: metadata.comments, publishedAt: metadata.publishedAt, mediaType: link.mediaType, term: context.term!, rawPayload: { source: "autoglm-share-link", term: context.term, candidate: context.candidateIndex + 1, resultFingerprint: context.platform.currentCard?.fingerprint, shareLinkResolved: true, coverEvidence: { source: coverEvidence.source, mimeType: coverEvidence.mimeType, capturedAt: coverEvidence.capturedAt } }, coverEvidence }; context.platform.seenIds.add(link.externalId); context.candidatePost = post; context.log("info", "candidate_captured", `候选 ${context.candidateIndex + 1} 已取得真实分享链接`, { externalId: link.externalId, mediaType: link.mediaType, checklistComplete: true }); }, recover: restoreTikTokResults },
      { id: "tiktok_candidate_return", state: "candidate_return", required: true, timeout: 180_000, attempts: 1, execute: restoreTikTokResults, recover: restoreTikTokResults },
    ],
    termSwitch: [{ id: "tiktok_term_switch", state: "term_switch", required: false, timeout: 15_000, attempts: 1, async execute(context) { context.log("info", "term_switch_ready", "保留 TikTok App 会话并切换下一追踪词", { normalLaunches: context.platform.normalLaunches }); } }],
    complete: [{ id: "tiktok_run_complete", state: "run_complete", required: false, timeout: 2_000, attempts: 1, async execute(context) { context.log("info", "run_completed", `TikTok 搜索完成：共取得 ${context.posts.length} 条真实分享链接`, { posts: context.posts.length, normalLaunches: context.platform.normalLaunches, recoveryLaunches: context.platform.recoveryLaunches }); } }],
  };
}

export async function discoverTikTok(request: PlatformDiscoveryRequest): Promise<TikTokDiscoveryResult> {
  const device = await selectDevice(request.deviceId);
  const session = sessions.get(request.accountId) ?? { state: "idle" as const };
  session.deviceId = device.serial;
  session.device = device;
  sessions.set(request.accountId, session);
  return runDiscoveryStateMachine({ request, platform: { device, seenIds: new Set<string>(), normalLaunches: 0, recoveryLaunches: 0 }, plan: tikTokPlan() });
}

async function tapText(device: Device, xml: string, candidates: string[]) {
  for (const candidate of candidates) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = xml.match(new RegExp(`<node\\b(?=[^>]*(?:text|content-desc)="${escaped}")(?=[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]")[^>]*>`));
    if (!match) continue;
    const x = Math.round((Number(match[1]) + Number(match[3])) / 2);
    const y = Math.round((Number(match[2]) + Number(match[4])) / 2);
    await adb([...deviceArgs(device.serial), "shell", "input", "tap", String(x), String(y)]);
    await new Promise((resolve) => setTimeout(resolve, 700));
    return true;
  }
  return false;
}

function xmlValues(xml: string, attribute: "text" | "content-desc") {
  const values: string[] = [];
  const expression = new RegExp(`${attribute}="([^"]*)"`, "g");
  for (const match of xml.matchAll(expression)) {
    const value = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
    if (value) values.push(value);
  }
  return [...new Set(values)];
}

function profileDisplayName(xml: string, handle: string) {
  const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map((match) => {
    const tag = match[0];
    const text = tag.match(/\btext="([^"]*)"/)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim() ?? "";
    const bounds = tag.match(/\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    return bounds ? { text, left: Number(bounds[1]), top: Number(bounds[2]), right: Number(bounds[3]), bottom: Number(bounds[4]) } : null;
  }).filter((node): node is NonNullable<typeof node> => Boolean(node?.text));
  const handleNode = nodes.find((node) => node.text === handle);
  if (!handleNode) return undefined;
  return nodes
    .filter((node) => node.text !== handle && node.bottom <= handleNode.top && handleNode.top - node.bottom <= 180 && node.right >= handleNode.left && node.left <= handleNode.right)
    .sort((left, right) => right.bottom - left.bottom)[0]?.text;
}

function identityFromUi(xml: string): TikTokIdentity | null {
  if (!xml.includes(`package="${TIKTOK_PACKAGE}"`)) return null;
  const texts = xmlValues(xml, "text");
  const handle = texts.find((value) => /^@[a-zA-Z0-9._-]{2,64}$/.test(value));
  const loggedInSignal = texts.includes("编辑");
  if (!handle || !loggedInSignal || texts.some((value) => /登录|注册|Log in|Sign up/i.test(value))) return null;
  const displayName = profileDisplayName(xml, handle)
    ?? handle.slice(1);
  return {
    handle,
    displayName,
    profileUrl: `https://www.tiktok.com/${handle}`,
    detectedAt: new Date().toISOString(),
  };
}

async function inspectDeviceUi(device: Device) {
  await launchTikTok(device);
  const size = await adb([...deviceArgs(device.serial), "shell", "wm", "size"]);
  const match = size.match(/Physical size:\s*(\d+)x(\d+)/);
  const width = Number(match?.[1] ?? 1116);
  const height = Number(match?.[2] ?? 2484);
  // Bring the profile tab into view before the first UI dump. On some builds
  // the feed keeps the accessibility tree busy while a video is playing.
  await adb([...deviceArgs(device.serial), "shell", "input", "tap", String(Math.round(width * 0.9)), String(Math.round(height * 0.95))]).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  let homeTapped = false;
  let lastUi = "";

  // Android TikTok restores an authenticated session asynchronously. Polling
  // the UI tree avoids treating a splash screen or a transient blank tree as
  // a logged-out account. The upper bound keeps a genuinely logged-out device
  // responsive for the dashboard user.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const xml = await dumpUi(device).catch(() => "");
    lastUi = xml || lastUi;
    if (!xml) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    const promptTapped = await tapText(device, xml, ["允许", "同意并继续", "接受", "我知道了"]);
    if (promptTapped) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    if (xml.includes("上滑查看更多视频")) {
      await adb([...deviceArgs(device.serial), "shell", "input", "swipe", String(Math.round(width * 0.5)), String(Math.round(height * 0.72)), String(Math.round(width * 0.5)), String(Math.round(height * 0.36)), "300"]);
      homeTapped = false;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      continue;
    }

    const identity = identityFromUi(xml);
    if (identity) return identity;

    // Prefer the actual bottom-tab node (text or content-desc). Some TikTok
    // builds expose only content-desc; coordinate tap remains the fallback.
    if (!homeTapped) {
      homeTapped = await tapText(device, xml, ["主页"]);
      if (!homeTapped && attempt >= 3) {
        await adb([...deviceArgs(device.serial), "shell", "input", "tap", String(Math.round(width * 0.9)), String(Math.round(height * 0.95))]);
        homeTapped = true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Keep the final parse explicit. This also makes the function resilient if
  // the final dump happened just as the UI changed.
  return identityFromUi(lastUi);
}

async function inspectDevice(device: Device) {
  const keys = ["window_animation_scale", "transition_animation_scale", "animator_duration_scale"] as const;
  const originalValues = await Promise.all(keys.map(async (key) => {
    const value = await adb([...deviceArgs(device.serial), "shell", "settings", "get", "global", key]).catch(() => "1");
    return value.trim() || "1";
  }));

  try {
    await Promise.all(keys.map((key) => adb([...deviceArgs(device.serial), "shell", "settings", "put", "global", key, "0"])));
    return await inspectDeviceUi(device);
  } finally {
    await Promise.all(keys.map((key, index) => adb([...deviceArgs(device.serial), "shell", "settings", "put", "global", key, originalValues[index]]).catch(() => undefined)));
  }
}

function routeFor(pathname: string) {
  const legacy = pathname.match(/^\/api\/tiktok-accounts\/([a-zA-Z0-9_-]+)\/(open|inspect|close|session)$/);
  if (legacy) return { platform: "TikTok", accountId: legacy[1], action: legacy[2] };
  const generic = pathname.match(/^\/api\/platform-accounts\/([^/]+)\/([^/]+)\/(open|inspect|close|session)$/);
  return generic ? { platform: decodeURIComponent(generic[1]), accountId: decodeURIComponent(generic[2]), action: generic[3] } : null;
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {} as Record<string, unknown>;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

export function tiktokAccountWorkerPlugin(): Plugin {
  return {
    name: "tiktok-account-worker",
    configureServer(server) {
      server.middlewares.use(async (request: IncomingMessage, response: ServerResponse, next) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (url.pathname === "/api/tiktok-accounts/health") {
          const devices = await listDevices();
          sendJson(response, 200, { status: "ready", provider: "adb_uiautomator2", appPackage: TIKTOK_PACKAGE, devices, deviceAvailable: devices.some((item) => item.state === "device") });
          return;
        }
        const platformHealth = url.pathname.match(/^\/api\/platform-accounts\/([^/]+)\/health$/);
        if (platformHealth) {
          const platform = decodeURIComponent(platformHealth[1]);
          if (platform === "TikTok") {
            const devices = await listDevices();
            sendJson(response, 200, { status: "ready", platform, provider: "adb_uiautomator2", appPackage: TIKTOK_PACKAGE, devices, deviceAvailable: devices.some((item) => item.state === "device") });
          } else if (platform === "小红书") {
            const devices = await listDevicesForPackage(XHS_PACKAGE);
            sendJson(response, 200, { status: "ready", platform, provider: "adb_uiautomator2", appPackage: XHS_PACKAGE, devices, deviceAvailable: devices.some((item) => item.state === "device") });
          } else {
            sendJson(response, 200, { status: "delegated", platform, provider: "http-adapter", detail: "请通过 /api/v1/platforms 查看 Adapter 配置状态" });
          }
          return;
        }
        const route = routeFor(url.pathname);
        if (!route) { next(); return; }
        try {
          const isXhs = route.platform === "小红书";
          if (!isXhs && route.platform !== "TikTok") { sendJson(response, 501, { error: `平台 ${route.platform} 手机 Worker 尚未实现，请使用对应 Adapter`, platform: route.platform, capabilities: { phoneControl: false } }); return; }
          const sessionStore = isXhs ? platformSessions : sessions;
          const existing = sessionStore.get(route.accountId) ?? { state: "idle" as const };
          if (request.method === "GET" && route.action === "session") {
            sendJson(response, 200, sessionPayloadFor(route.platform, isXhs ? XHS_PACKAGE : TIKTOK_PACKAGE, route.accountId, existing));
            return;
          }
          const body = request.method === "POST" ? await readJsonBody(request) : {};
          if (route.action === "close") {
            existing.state = "idle";
            existing.error = undefined;
            sendJson(response, 200, sessionPayloadFor(route.platform, isXhs ? XHS_PACKAGE : TIKTOK_PACKAGE, route.accountId, existing));
            return;
          }
          const device = isXhs ? await selectDeviceForPackage(typeof body.deviceId === "string" ? body.deviceId : existing.deviceId, XHS_PACKAGE, "小红书") : await selectDevice(typeof body.deviceId === "string" ? body.deviceId : existing.deviceId);
          existing.deviceId = device.serial;
          existing.device = device;
          existing.error = undefined;
          sessionStore.set(route.accountId, existing);
          if (route.action === "open") {
            if (isXhs) await launchXhs(device); else await launchTikTok(device);
            existing.state = "waiting_for_login";
          } else if (route.action === "inspect") {
            const identity = isXhs ? await inspectXhs(device) : await inspectDevice(device);
            existing.lastCheckedAt = new Date().toISOString();
            existing.identity = identity ?? undefined;
            existing.state = identity ? "identity_detected" : "waiting_for_login";
            existing.error = identity ? undefined : `${route.platform} 已打开，但未检测到已登录的主页；请先在手机上完成登录，再重新检测`;
          }
          sendJson(response, 200, sessionPayloadFor(route.platform, isXhs ? XHS_PACKAGE : TIKTOK_PACKAGE, route.accountId, existing));
        } catch (error) {
          const isXhs = route.platform === "小红书";
          const sessionStore = isXhs ? platformSessions : sessions;
          const session = sessionStore.get(route.accountId) ?? { state: "error" as const };
          session.state = "error";
          session.error = error instanceof Error ? error.message : "TikTok 手机 Worker 执行失败";
          sessionStore.set(route.accountId, session);
          sendJson(response, 500, sessionPayloadFor(route.platform, isXhs ? XHS_PACKAGE : TIKTOK_PACKAGE, route.accountId, session));
        }
      });
    },
  };
}
