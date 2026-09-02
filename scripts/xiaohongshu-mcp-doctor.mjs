import { readEnvFile } from "./lib/runtime.mjs";

const jsonOutput = process.argv.includes("--json");
const env = readEnvFile();
const endpointConfigured = Boolean(env.XIAOHONGSHU_MCP_BASE_URL?.trim());
const boundAccountId = env.XIAOHONGSHU_MCP_ACCOUNT_ID?.trim() || "";
const accountBound = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(boundAccountId);
const configured = endpointConfigured && accountBound;
const report = { configured, accountBound, reachable: false, loggedIn: false, endpoint: "", detail: "" };

function safeEndpoint(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol) || !["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error("XIAOHONGSHU_MCP_BASE_URL 必须是没有内嵌凭据的 HTTP(S) 回环地址");
  }
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  const base = url.toString().replace(/\/$/, "");
  return base.endsWith("/mcp") ? base : `${base}/mcp`;
}

function responseText(payload) {
  let envelope;
  try { envelope = JSON.parse(payload); }
  catch {
    const lines = payload.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter((line) => line && line !== "[DONE]");
    for (let index = lines.length - 1; index >= 0 && !envelope; index -= 1) {
      try { envelope = JSON.parse(lines[index]); } catch { /* Continue. */ }
    }
  }
  if (!envelope?.result?.content) throw new Error(envelope?.error?.message || "响应不是有效 MCP 工具结果");
  return envelope.result.content.filter((item) => item?.type === "text").map((item) => item.text).join("\n");
}

if (!configured) {
  report.detail = endpointConfigured && !accountBound
    ? "已设置 MCP 地址，但缺少有效 XIAOHONGSHU_MCP_ACCOUNT_ID；为防止会话串号，当前配置无效并直接使用手机视觉抓取。"
    : "未配置；Marketing Pipeline 会继续直接使用现有手机视觉抓取。";
} else {
  try {
    report.endpoint = safeEndpoint(env.XIAOHONGSHU_MCP_BASE_URL.trim());
    const timeout = /^\d+$/.test(env.XIAOHONGSHU_MCP_TIMEOUT_MS || "") ? Number(env.XIAOHONGSHU_MCP_TIMEOUT_MS) : 70_000;
    const response = await fetch(report.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(env.XIAOHONGSHU_MCP_TOKEN?.trim() ? { Authorization: `Bearer ${env.XIAOHONGSHU_MCP_TOKEN.trim()}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: "doctor", method: "tools/call", params: { name: "check_login_status", arguments: {} } }),
      signal: AbortSignal.timeout(timeout),
    });
    const payload = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status} ${payload.slice(0, 300)}`);
    report.reachable = true;
    const status = responseText(payload);
    report.loggedIn = !/未登录|请先登录|not logged|login required/i.test(status) && /已登录|logged in|login status\s*:\s*true/i.test(status);
    report.detail = report.loggedIn ? "MCP 可达且小红书登录有效。" : `MCP 可达，但登录未确认：${status.slice(0, 300)}`;
  } catch (error) {
    report.detail = error instanceof Error ? error.message : "未知 MCP 诊断错误";
  }
}

if (jsonOutput) console.log(JSON.stringify(report, null, 2));
else {
  console.log("Xiaohongshu MCP Doctor\n");
  console.log(`${report.configured ? "[已配置]" : "[未配置]"} endpoint: ${report.endpoint || "-"}`);
  console.log(`${report.accountBound ? "[OK]" : "[未绑定]"} account identity`);
  console.log(`${report.reachable ? "[OK]" : "[不可用]"} reachable`);
  console.log(`${report.loggedIn ? "[OK]" : "[未就绪]"} login`);
  console.log(`\n${report.detail}`);
  console.log("\nMCP 不可用不会禁用现有 Android 手机视觉抓取。配置 MCP 后，运行规则仍要求 Phone Doctor Ready，以保证自动回退可用。");
}

process.exitCode = report.configured && report.reachable && report.loggedIn ? 0 : 2;
