import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { commandExists, dockerCommand, npmArguments, npmCommand, projectRoot, run } from "./lib/runtime.mjs";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12)) throw new Error(`需要 Node.js >= 22.12.0，当前为 ${process.version}`);
if (!commandExists("git")) throw new Error("缺少 Git。请先由 Agent 安装 Git，然后重新执行 npm run setup。");

const envPath = join(projectRoot, ".env");
if (!existsSync(envPath)) {
  await copyFile(join(projectRoot, ".env.example"), envPath);
  console.log("已创建本地 .env。API Key 不会被提交到 Git。");
}
await mkdir(join(projectRoot, "data"), { recursive: true });

console.log("安装锁定版本的 Node.js 依赖…");
run(npmCommand, npmArguments(["ci"]));
console.log("安装 Phone 工具链…");
run(npmCommand, npmArguments(["run", "phone:install"]));
console.log("生成 Prisma Client…");
run(npmCommand, npmArguments(["run", "db:generate"]));
console.log("连接 PostgreSQL 并应用数据库迁移…");
let migrated = run(npmCommand, npmArguments(["run", "db:migrate"]), { capture: true, allowFailure: true });
if (migrated.status !== 0) {
  if (!commandExists("docker")) throw new Error("PostgreSQL 不可用且缺少 Docker。请先由 Agent 安装并启动 Docker Desktop/Engine，然后重新执行 npm run setup。");
  console.log("未检测到可用的现有 PostgreSQL，启动仓库自带的 Docker PostgreSQL…");
  run(dockerCommand, ["compose", "up", "-d", "--wait", "postgres"]);
  run(npmCommand, npmArguments(["run", "db:migrate"]));
} else {
  console.log("复用 DATABASE_URL 指向的现有 PostgreSQL。");
}

console.log("\n基础依赖安装完成。下一步请让 Agent 执行 npm run phone:doctor，并按报告完成手机授权、厂商驱动和 AutoGLM API Key 配置。");
