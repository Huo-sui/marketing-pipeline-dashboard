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
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
vite.on("exit", (code) => {
  if (appium?.exitCode === null) appium.kill("SIGTERM");
  process.exitCode = code ?? 0;
});
