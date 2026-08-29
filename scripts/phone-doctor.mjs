import { existsSync } from "node:fs";
import { join } from "node:path";
import { commandExists, dockerCommand, isWindows, npmArguments, npmCommand, projectRoot, readEnvFile, redactSerial, run, runtimeEnv } from "./lib/runtime.mjs";

const jsonOutput = process.argv.includes("--json");
const envFile = readEnvFile();
const env = runtimeEnv();
const adbName = isWindows ? "adb.exe" : "adb";
const candidates = [
  env.ADB_PATH,
  join(env.ANDROID_HOME, "platform-tools", adbName),
  join(projectRoot, "tools", "android-platform-tools", "platform-tools", adbName),
].filter(Boolean);
const adb = candidates.find((value) => existsSync(value)) || (commandExists("adb") ? "adb" : "");
const localJava = env.JAVA_HOME ? join(env.JAVA_HOME, "bin", isWindows ? "java.exe" : "java") : "";

function checkCommand(command, args = ["--version"]) {
  if (!command || (!existsSync(command) && !commandExists(command))) return { ok: false, detail: "未安装" };
  const result = run(command, args, { capture: true, allowFailure: true, timeout: 15_000 });
  const detail = `${result.stdout || ""}${result.stderr || ""}`.trim().split(/\r?\n/)[0] || `exit ${result.status}`;
  return { ok: result.status === 0, detail };
}

const checks = {
  node: { ok: Number(process.versions.node.split(".")[0]) >= 22, detail: process.version },
  npm: checkCommand(npmCommand, npmArguments(["--version"])),
  git: checkCommand("git", ["--version"]),
  docker: checkCommand(dockerCommand, ["info", "--format", "{{.ServerVersion}}"]),
  java: checkCommand(existsSync(localJava) ? localJava : "java", ["-version"]),
  adb: checkCommand(adb, ["version"]),
  appium: { ok: existsSync(join(projectRoot, "node_modules", "appium", "index.js")), detail: "项目本地依赖" },
  uiautomator2: { ok: existsSync(join(projectRoot, "node_modules", "appium-uiautomator2-driver", "package.json")), detail: "项目本地依赖" },
  databaseUrl: { ok: Boolean(envFile.DATABASE_URL?.trim()), detail: envFile.DATABASE_URL?.trim() ? "已配置" : "缺失" },
  autoGlmKey: { ok: Boolean(envFile.ZHIPU_API_KEY?.trim()), detail: envFile.ZHIPU_API_KEY?.trim() ? "已配置（值已隐藏）" : "缺失" },
};
const databaseStatus = run(npmCommand, npmArguments(["exec", "--", "prisma", "migrate", "status"]), { capture: true, allowFailure: true, timeout: 30_000 });
checks.database = { ok: databaseStatus.status === 0, detail: databaseStatus.status === 0 ? "已连接且迁移状态正常" : "不可用或迁移未完成" };

const devices = [];
if (checks.adb.ok) {
  const listed = run(adb, ["devices", "-l"], { capture: true, allowFailure: true, timeout: 15_000 });
  for (const line of (listed.stdout || "").split(/\r?\n/).slice(1)) {
    const match = line.trim().match(/^([^\s]+)\s+(device|offline|unauthorized)(?:\s+(.*))?$/);
    if (!match) continue;
    const serial = match[1];
    const state = match[2];
    const props = {};
    const getprop = (name) => {
      if (state !== "device") return "";
      const result = run(adb, ["-s", serial, "shell", "getprop", name], { capture: true, allowFailure: true, timeout: 8_000 });
      return (result.stdout || "").trim();
    };
    props.manufacturer = getprop("ro.product.manufacturer");
    props.model = getprop("ro.product.model") || match[3]?.match(/model:([^\s]+)/)?.[1]?.replace(/_/g, " ") || "";
    props.androidVersion = getprop("ro.build.version.release");
    props.sdk = getprop("ro.build.version.sdk");
    const packages = {};
    for (const [name, packageName] of [["tiktok", "com.zhiliaoapp.musically"], ["xiaohongshu", "com.xingin.xhs"]]) {
      const installed = state === "device" && run(adb, ["-s", serial, "shell", "pm", "path", packageName], { capture: true, allowFailure: true, timeout: 8_000 }).status === 0;
      packages[name] = installed;
    }
    devices.push({ serial: redactSerial(serial), state, ...props, packages, needsManualModel: state === "device" && !props.model });
  }
}

const authorizedAndroid = devices.some((device) => device.state === "device" && device.androidVersion);
const unauthorized = devices.some((device) => device.state === "unauthorized");
const deviceGuidance = authorizedAndroid
  ? "Android 手机已连接且 USB 调试已授权。"
  : unauthorized
    ? "已检测到手机，但电脑尚未获得 USB 调试授权。请解锁手机并接受 RSA 指纹弹窗，然后重新运行检查。"
    : "ADB 尚未发现已授权的 Android 手机。请用可传输数据的 USB 线连接手机，开启开发者选项和 USB 调试；Windows 用户可能还需安装该机型厂商 USB Driver。";

const requiredChecks = ["node", "npm", "git", "java", "adb", "appium", "uiautomator2", "databaseUrl", "database", "autoGlmKey"];
const ready = requiredChecks.every((name) => checks[name].ok) && authorizedAndroid;
const report = {
  ready,
  checks,
  phone: { authorizedAndroid, unauthorized, devices, guidance: deviceGuidance },
  nextActions: [
    ...(!checks.database.ok && !checks.docker.ok ? ["PostgreSQL 不可用。安装并启动 Docker Desktop/Engine，或提供可用 DATABASE_URL，然后重新运行检查。"] : []),
    ...(!checks.java.ok ? ["执行 npm run phone:install 重新安装项目本地 Temurin JDK 17。"] : []),
    ...(!checks.adb.ok ? ["执行 npm run phone:install 安装 Android Platform Tools。"] : []),
    ...(!authorizedAndroid ? [deviceGuidance] : []),
    ...(!checks.autoGlmKey.ok ? ["访问 https://open.bigmodel.cn/usercenter/apikeys 创建 API Key，然后将它写入本地 .env 的 ZHIPU_API_KEY= 后面；不要粘贴到聊天或提交到 Git。"] : []),
    ...(devices.some((device) => device.needsManualModel) ? ["ADB 未能读取机型，请让用户手动输入手机品牌和完整型号，再查找该厂商的开发者模式与 USB Driver 官方说明。"] : []),
  ],
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("Marketing Pipeline Phone Doctor\n");
  for (const [name, value] of Object.entries(checks)) console.log(`${value.ok ? "[OK]" : "[缺失]"} ${name}: ${value.detail}`);
  console.log(`\n${deviceGuidance}`);
  for (const device of devices) console.log(`- ${device.manufacturer || "未知厂商"} ${device.model || "未知型号"} · Android ${device.androidVersion || "未知"} · ${device.state} · TikTok=${device.packages.tiktok ? "已安装" : "未安装"} · 小红书=${device.packages.xiaohongshu ? "已安装" : "未安装"}`);
  if (report.nextActions.length) {
    console.log("\n下一步：");
    report.nextActions.forEach((action, index) => console.log(`${index + 1}. ${action}`));
  }
  console.log(`\n完整 Phone 模式：${ready ? "READY" : "NOT READY"}`);
}

process.exitCode = ready ? 0 : 2;
