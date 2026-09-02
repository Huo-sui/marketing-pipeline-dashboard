import { existsSync } from "node:fs";
import { join } from "node:path";
import { commandExists, dockerCommand, npmArguments, npmCommand, projectRoot, readEnvFile, run, runtimeEnv, spawnLongRunning } from "./lib/runtime.mjs";

if (!existsSync(join(projectRoot, ".env"))) throw new Error("缺少 .env。请先执行 npm run setup。");
if (!existsSync(join(projectRoot, "node_modules", "appium", "index.js"))) throw new Error("依赖未安装。请先执行 npm run setup。");

let database = run(npmCommand, npmArguments(["run", "db:migrate"]), { capture: true, allowFailure: true });
if (database.status !== 0) {
  if (!commandExists("docker")) throw new Error("PostgreSQL 不可用且没有安装 Docker。请先执行 npm run setup。");
  run(dockerCommand, ["compose", "up", "-d", "--wait", "postgres"]);
  run(npmCommand, npmArguments(["run", "db:migrate"]));
} else {
  console.log("复用 DATABASE_URL 指向的现有 PostgreSQL。");
}
const envFile = readEnvFile();
const port = /^\d{2,5}$/.test(envFile.MARKETING_PIPELINE_PORT || "") ? envFile.MARKETING_PIPELINE_PORT : "3210";
const env = runtimeEnv();

let xiaohongshuMcp;
const mcpBaseUrl = envFile.XIAOHONGSHU_MCP_BASE_URL?.trim();
const mcpBinary = envFile.XIAOHONGSHU_MCP_BINARY?.trim();
const mcpCookiesPath = envFile.XIAOHONGSHU_MCP_COOKIES_PATH?.trim();
if (mcpBaseUrl && mcpBinary && existsSync(mcpBinary)) {
  let running = false;
  try {
    const normalizedBase = mcpBaseUrl.replace(/\/+$/, "");
    const endpoint = normalizedBase.endsWith("/mcp") ? normalizedBase : `${normalizedBase}/mcp`;
    const probe = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: "startup-probe", method: "tools/list", params: {} }), signal: AbortSignal.timeout(2_000) });
    if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
    running = true;
    console.log("复用已运行的本地小红书 MCP 服务。");
  } catch { /* Start the configured local binary below. */ }
  if (!running) {
    const mcpUrl = new URL(mcpBaseUrl);
    const mcpPort = mcpUrl.port || (mcpUrl.protocol === "https:" ? "443" : "80");
    if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(mcpUrl.hostname)) throw new Error("XIAOHONGSHU_MCP_BASE_URL 必须是回环地址");
    xiaohongshuMcp = spawnLongRunning(mcpBinary, ["-port", `127.0.0.1:${mcpPort}`], { env: {
      ...env,
      ...(envFile.XIAOHONGSHU_MCP_LOCALAPPDATA?.trim() ? { LOCALAPPDATA: envFile.XIAOHONGSHU_MCP_LOCALAPPDATA.trim() } : {}),
      ...(mcpCookiesPath ? { COOKIES_PATH: mcpCookiesPath } : {}),
    } });
    xiaohongshuMcp.on("exit", (code) => {
      if (code && code !== 0) console.error(`小红书 MCP 已退出（exit ${code}），Discovery 将自动回退到手机视觉。`);
    });
  }
}

let appium;
try {
  const status = await fetch("http://127.0.0.1:4723/wd/hub/status", { signal: AbortSignal.timeout(1_000) });
  if (!status.ok) throw new Error("not ready");
  console.log("复用已运行的本地 Appium 服务。");
} catch {
  appium = spawnLongRunning(npmCommand, npmArguments(["exec", "--", "appium", "--address", "127.0.0.1", "--port", "4723", "--base-path", "/wd/hub", "--log-timestamp"]), { env });
  appium.on("exit", (code) => {
    if (code && code !== 0) console.error(`Appium 已退出（exit ${code}）。请运行 npm run phone:doctor。`);
  });
}

const vite = spawnLongRunning(npmCommand, npmArguments(["exec", "--", "vite", "--host", "127.0.0.1", "--port", port, "--strictPort"]), { env });
console.log(`Marketing Pipeline 正在启动：http://127.0.0.1:${port}`);

function shutdown(signal) {
  if (vite.exitCode === null) vite.kill(signal);
  if (appium?.exitCode === null) appium.kill(signal);
  if (xiaohongshuMcp?.exitCode === null) xiaohongshuMcp.kill(signal);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
vite.on("exit", (code) => {
  if (appium?.exitCode === null) appium.kill("SIGTERM");
  if (xiaohongshuMcp?.exitCode === null) xiaohongshuMcp.kill("SIGTERM");
  process.exitCode = code ?? 0;
});
