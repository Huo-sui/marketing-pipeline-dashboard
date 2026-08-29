import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { resolveAdbExecutable, resolveAndroidSdkRoot, resolveLocalAppiumEntry } from "./androidToolchain.js";

const execFileAsync = promisify(execFile);
const appiumBaseUrl = (process.env.APPIUM_URL ?? "http://127.0.0.1:4723/wd/hub").replace(/\/$/, "");

export type AndroidDevice = { serial: string; model?: string; appInstalled: boolean };
export type AndroidUiNode = { text: string; desc: string; className: string; bounds?: { left: number; top: number; right: number; bottom: number } };

function deviceArgs(serial: string) {
  if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(serial)) throw new Error("设备序列号格式无效");
  return ["-s", serial];
}

function decodeXml(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

export function androidUiNodes(xml: string): AndroidUiNode[] {
  return [...xml.matchAll(/<(?:node|android\.[^\s>]+)\b[^>]*>/g)].map((match) => {
    const tag = match[0];
    const bounds = tag.match(/\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    return {
      text: decodeXml(tag.match(/\btext="([^"]*)"/)?.[1] ?? ""),
      desc: decodeXml(tag.match(/\bcontent-desc="([^"]*)"/)?.[1] ?? ""),
      className: decodeXml(tag.match(/\bclass="([^"]*)"/)?.[1] ?? match[0].match(/^<([^\s>]+)/)?.[1] ?? ""),
      bounds: bounds ? { left: Number(bounds[1]), top: Number(bounds[2]), right: Number(bounds[3]), bottom: Number(bounds[4]) } : undefined,
    };
  });
}

export class AndroidPhoneDriver {
  private appiumSessionId = "";
  readonly device: AndroidDevice;
  readonly appPackage: string;
  readonly appLabel: string;

  constructor(device: AndroidDevice, appPackage: string, appLabel: string) {
    this.device = device;
    this.appPackage = appPackage;
    this.appLabel = appLabel;
  }

  private async adb(args: string[], maxBuffer = 2_000_000) {
    return (await execFileAsync(resolveAdbExecutable(), [...deviceArgs(this.device.serial), ...args], { windowsHide: true, timeout: 15_000, killSignal: "SIGKILL", maxBuffer })).stdout;
  }

  static async connect(appPackage: string, appLabel: string, requestedSerial?: string) {
    const adbPath = resolveAdbExecutable();
    const output = (await execFileAsync(adbPath, ["devices", "-l"], { windowsHide: true, timeout: 8_000, maxBuffer: 200_000 })).stdout;
    const devices = output.split(/\r?\n/).slice(1).flatMap((line) => {
      const match = line.trim().match(/^([^\s]+)\s+(device|offline|unauthorized)(?:\s+(.*))?$/);
      if (!match) return [];
      return [{ serial: match[1], state: match[2], model: match[3]?.match(/model:([^\s]+)/)?.[1]?.replace(/_/g, " ") }];
    });
    const selected = requestedSerial ? devices.find((item) => item.serial === requestedSerial) : devices.find((item) => item.state === "device");
    if (!selected) throw new Error(requestedSerial ? `找不到设备 ${requestedSerial}` : "没有检测到已授权的 Android 手机");
    if (selected.state !== "device") throw new Error(`设备 ${selected.serial} 当前状态为 ${selected.state}，请确认 USB 调试授权`);
    const installed = (await execFileAsync(adbPath, [...deviceArgs(selected.serial), "shell", "pm", "path", appPackage], { windowsHide: true, timeout: 8_000, maxBuffer: 200_000 })).stdout.includes(appPackage);
    if (!installed) throw new Error(`设备上没有安装${appLabel}`);
    return new AndroidPhoneDriver({ serial: selected.serial, model: selected.model, appInstalled: true }, appPackage, appLabel);
  }

  async ensureUnlocked() {
    const state = await this.adb(["shell", "dumpsys", "window"], 500_000);
    if (/isKeyguardShowing=true|mDreamingLockscreen=true/.test(state)) throw new Error(`${this.appLabel}采集手机当前处于系统锁屏，请解锁后重试`);
  }

  async launch() {
    await this.ensureUnlocked();
    await this.adb(["shell", "am", "force-stop", this.appPackage]);
    await this.adb(["shell", "monkey", "-p", this.appPackage, "1"]);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const xml = await this.source().catch(() => "");
      if (xml.includes(this.appPackage)) return xml;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    throw new Error(`${this.appLabel}启动后 30 秒仍未暴露可交互 UI`);
  }

  async source() {
    if (this.appiumSessionId) {
      const response = await fetch(`${appiumBaseUrl}/session/${this.appiumSessionId}/source`, { signal: AbortSignal.timeout(20_000) });
      if (response.ok) {
        const payload = await response.json() as { value?: unknown };
        if (typeof payload.value === "string") return payload.value;
      }
      this.appiumSessionId = "";
    }
    await this.adb(["shell", "uiautomator", "dump", "/sdcard/marketing-pipeline-window.xml"], 500_000).catch(() => "");
    return this.adb(["shell", "cat", "/sdcard/marketing-pipeline-window.xml"], 3_000_000).catch(() => "");
  }

  async size() {
    const output = await this.adb(["shell", "wm", "size"]);
    const match = output.match(/Physical size:\s*(\d+)x(\d+)/);
    return { width: Number(match?.[1] ?? 1080), height: Number(match?.[2] ?? 2400) };
  }

  async tap(x: number, y: number, waitMs = 900) {
    await this.adb(["shell", "input", "tap", String(Math.round(x)), String(Math.round(y))]);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  async openUri(uri: string, waitMs = 2_000) {
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) throw new Error("Android URI 格式无效");
    await this.adb(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", uri, this.appPackage]);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  async swipe(startX: number, startY: number, endX: number, endY: number, durationMs = 500) {
    await this.adb(["shell", "input", "swipe", String(Math.round(startX)), String(Math.round(startY)), String(Math.round(endX)), String(Math.round(endY)), String(durationMs)]);
    await new Promise((resolve) => setTimeout(resolve, 1_200));
  }

  async tapNode(predicate: (node: AndroidUiNode) => boolean, xml?: string) {
    const node = androidUiNodes(xml ?? await this.source()).find((item) => item.bounds && predicate(item));
    if (!node?.bounds) return false;
    await this.tap((node.bounds.left + node.bounds.right) / 2, (node.bounds.top + node.bounds.bottom) / 2);
    return true;
  }

  async key(code: string) {
    await this.adb(["shell", "input", "keyevent", code]);
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  private async ensureAppiumServer() {
    try {
      const response = await fetch(`${appiumBaseUrl}/status`, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) return;
    } catch { /* start the local dependency below */ }
    if (process.platform === "win32") {
      const entry = resolveLocalAppiumEntry();
      if (!entry) throw new Error("Appium 未运行，且没有找到本机 Appium 入口");
      const sdkRoot = resolveAndroidSdkRoot();
      const child = spawn(process.execPath, [entry, "--address", "127.0.0.1", "--port", "4723", "--base-path", "/wd/hub", "--log-timestamp"], { detached: true, windowsHide: true, stdio: "ignore", env: { ...process.env, ANDROID_HOME: sdkRoot, ANDROID_SDK_ROOT: sdkRoot } });
      child.unref();
    } else {
      const child = spawn("npx", ["appium", "--address", "127.0.0.1", "--port", "4723", "--base-path", "/wd/hub"], { detached: true, stdio: "ignore" });
      child.unref();
    }
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${appiumBaseUrl}/status`, { signal: AbortSignal.timeout(1_500) });
        if (response.ok) return;
      } catch { /* keep polling */ }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    throw new Error("Appium 依赖在 45 秒内没有启动成功");
  }

  async ensureAppiumSession() {
    if (this.appiumSessionId) return this.appiumSessionId;
    await this.ensureAppiumServer();
    const response = await fetch(`${appiumBaseUrl}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capabilities: { alwaysMatch: { platformName: "Android", "appium:automationName": "UiAutomator2", "appium:udid": this.device.serial, "appium:noReset": true, "appium:dontStopAppOnReset": true, "appium:appPackage": this.appPackage, "appium:newCommandTimeout": 600 }, firstMatch: [{}] } }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Appium session 创建失败 (${response.status})`);
    const payload = await response.json() as { value?: { sessionId?: string }; sessionId?: string };
    this.appiumSessionId = payload.value?.sessionId ?? payload.sessionId ?? "";
    if (!this.appiumSessionId) throw new Error("Appium 响应中没有 sessionId");
    return this.appiumSessionId;
  }

  async releaseAppiumSession() {
    if (!this.appiumSessionId) return;
    const session = this.appiumSessionId;
    this.appiumSessionId = "";
    await fetch(`${appiumBaseUrl}/session/${session}`, { method: "DELETE", signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
  }

  async replaceFocusedText(value: string) {
    const session = await this.ensureAppiumSession();
    const found = await fetch(`${appiumBaseUrl}/session/${session}/elements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ using: "class name", value: "android.widget.EditText" }), signal: AbortSignal.timeout(12_000) });
    const payload = await found.json() as { value?: Array<Record<string, string>> };
    const element = payload.value?.[0];
    const elementId = element?.["element-6066-11e4-a52e-4f735466cecf"] ?? element?.ELEMENT;
    if (!elementId) throw new Error(`${this.appLabel}搜索框未找到可输入控件`);
    await fetch(`${appiumBaseUrl}/session/${session}/element/${elementId}/clear`, { method: "POST", signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
    const sent = await fetch(`${appiumBaseUrl}/session/${session}/element/${elementId}/value`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value, value: [...value] }), signal: AbortSignal.timeout(15_000) });
    if (!sent.ok) throw new Error(`${this.appLabel}搜索词输入失败 (${sent.status})`);
  }

  async clearClipboard() {
    const session = await this.ensureAppiumSession();
    await fetch(`${appiumBaseUrl}/session/${session}/appium/device/set_clipboard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "", contentType: "plaintext" }), signal: AbortSignal.timeout(10_000) });
  }

  async clipboard() {
    const session = await this.ensureAppiumSession();
    const response = await fetch(`${appiumBaseUrl}/session/${session}/appium/device/get_clipboard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: "plaintext" }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return "";
    const payload = await response.json() as { value?: unknown };
    if (typeof payload.value !== "string") return "";
    try { return Buffer.from(payload.value, "base64").toString("utf8").replace(/[\r\n]/g, " ").trim(); } catch { return payload.value.trim(); }
  }
}
