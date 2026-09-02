import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { projectRoot, readEnvFile } from "./lib/runtime.mjs";

const env = readEnvFile();
const timeoutMs = 10 * 60_000;

function localPath(value, fallback) {
  const candidate = value?.trim() || fallback;
  return isAbsolute(candidate) ? candidate : resolve(projectRoot, candidate);
}

function findChrome() {
  const candidates = [
    env.XIAOHONGSHU_MCP_LOGIN_CHROME_PATH?.trim(),
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);
  const chrome = candidates.find((candidate) => existsSync(candidate));
  if (!chrome) throw new Error("没有找到系统 Google Chrome；可在 .env 设置 XIAOHONGSHU_MCP_LOGIN_CHROME_PATH");
  return chrome;
}

async function freeLoopbackPort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function waitForCdp(port, deadline) {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch { /* Chrome is still starting. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Google Chrome 登录窗口启动超时");
}

async function loginIdentity(page) {
  return await page.evaluate(() => {
    const state = globalThis.__INITIAL_STATE__;
    const user = state?.user;
    const raw = user?.userInfo?.value ?? user?.userInfo;
    const nickname = typeof raw?.nickname === "string" ? raw.nickname.trim() : "";
    const userId = typeof (raw?.userId ?? raw?.user_id) === "string" ? (raw.userId ?? raw.user_id).trim() : "";
    const guest = raw?.guest === true;
    const profileLink = [...document.querySelectorAll("a[href]")].find((element) => {
      const href = element.getAttribute("href") || "";
      const text = (element.textContent || "").trim();
      return href.includes("/user/profile/") && text === "我";
    });
    return { nickname, userId, guest, hasProfileLink: Boolean(profileLink) };
  });
}

function priorSeed(cookiePath) {
  if (!existsSync(cookiePath)) return 0;
  try {
    const parsed = JSON.parse(readFileSync(cookiePath, "utf8"));
    return Number.isInteger(parsed?.seed) && parsed.seed > 0 ? parsed.seed : 0;
  } catch { return 0; }
}

function saveSession(cookiePath, cookies) {
  mkdirSync(dirname(cookiePath), { recursive: true });
  const payload = {
    version: 2,
    ...(priorSeed(cookiePath) ? { seed: priorSeed(cookiePath) } : {}),
    saved_at: new Date().toISOString(),
    cookies,
  };
  writeFileSync(cookiePath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

const cookiePath = localPath(env.XIAOHONGSHU_MCP_COOKIES_PATH, "data/runtime/xiaohongshu-mcp/cookies.json");
const profileDir = localPath(env.XIAOHONGSHU_MCP_LOGIN_PROFILE_DIR, "data/browser-profiles/xiaohongshu-mcp-login");
const expectedNickname = env.XIAOHONGSHU_MCP_EXPECTED_DISPLAY_NAME?.trim() || "";
const port = await freeLoopbackPort();
const deadline = Date.now() + timeoutMs;
mkdirSync(profileDir, { recursive: true });

const child = spawn(findChrome(), [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  "--profile-directory=Default",
  "--no-first-run",
  "--no-default-browser-check",
  "https://www.xiaohongshu.com/explore",
], { detached: false, stdio: "ignore", windowsHide: true });

let browser;
try {
  await waitForCdp(port, deadline);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  let page = context.pages().find((candidate) => candidate.url().includes("xiaohongshu.com"));
  if (!page) {
    page = await context.newPage();
    await page.goto("https://www.xiaohongshu.com/explore", { waitUntil: "domcontentloaded", timeout: 30_000 });
  }
  console.log("已打开真实 Google Chrome 小红书登录窗口。请在该窗口完成扫码/验证；程序只在登录状态通过后保存会话。\n");

  let identity;
  while (Date.now() < deadline) {
    try {
      identity = await loginIdentity(page);
      if (!identity.guest && identity.hasProfileLink) break;
    } catch { /* Page may be navigating during login. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
  if (!identity || identity.guest || !identity.hasProfileLink) throw new Error("10 分钟内没有确认小红书登录成功；未写入任何 MCP 会话");
  if (expectedNickname && identity.nickname && identity.nickname !== expectedNickname) {
    throw new Error(`登录账号不匹配：期望“${expectedNickname}”，实际“${identity.nickname}”；未写入 MCP 会话`);
  }
  const cookies = (await context.cookies()).filter((cookie) => /(^|\.)xiaohongshu\.com$/i.test(cookie.domain));
  if (!cookies.some((cookie) => cookie.name === "a1" && cookie.value) || !cookies.some((cookie) => cookie.name === "web_session" && cookie.value)) {
    throw new Error("页面看似已登录，但缺少 a1 或 web_session；未写入 MCP 会话");
  }
  saveSession(cookiePath, cookies);
  console.log(`登录会话已验证并保存（${cookies.length} 个小红书 Cookie，未输出 Cookie 值）。`);
  console.log("下一步请运行 npm run xhs:mcp:doctor；只有 doctor 显示登录有效才算完成。");
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (!child.killed) child.kill();
}
