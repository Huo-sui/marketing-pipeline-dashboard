import { createWriteStream, existsSync } from "node:fs";
import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { commandExists, isWindows, projectRoot, run } from "./lib/runtime.mjs";

const archives = {
  win32: "https://dl.google.com/android/repository/platform-tools-latest-windows.zip",
  darwin: "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip",
  linux: "https://dl.google.com/android/repository/platform-tools-latest-linux.zip",
};

const url = archives[process.platform];
if (!url) throw new Error(`暂不支持自动安装 Android Platform Tools：${process.platform}`);

const dataRoot = join(projectRoot, "data");
const downloads = join(dataRoot, "downloads");
const toolchain = join(dataRoot, "toolchain");
const sdkRoot = join(toolchain, "android-sdk");
const platformTools = join(sdkRoot, "platform-tools");
const adb = join(platformTools, isWindows ? "adb.exe" : "adb");
const javaHome = join(toolchain, "jdk-17");
const java = join(javaHome, "bin", isWindows ? "java.exe" : "java");
const windowsTar = join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");

async function download(url, target) {
  console.log(`正在从官方地址下载：${url}`);
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(180_000) });
  if (!response.ok || !response.body) throw new Error(`依赖下载失败：HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
}

if (!existsSync(adb)) {
  await mkdir(downloads, { recursive: true });
  await mkdir(toolchain, { recursive: true });
  const archive = join(downloads, `platform-tools-${process.platform}.zip`);
  const extractRoot = join(downloads, `platform-tools-extract-${process.pid}`);
  await download(url, archive);
  await rm(extractRoot, { recursive: true, force: true });
  await mkdir(extractRoot, { recursive: true });
  if (isWindows) {
    run(windowsTar, ["-xf", archive, "-C", extractRoot]);
  } else if (process.platform === "darwin") {
    run("ditto", ["-x", "-k", archive, extractRoot]);
  } else {
    if (!commandExists("unzip")) throw new Error("缺少 unzip。请先安装 unzip，然后重新执行 npm run phone:install。");
    run("unzip", ["-q", "-o", archive, "-d", extractRoot]);
  }
  await mkdir(sdkRoot, { recursive: true });
  await rm(platformTools, { recursive: true, force: true });
  await rename(join(extractRoot, "platform-tools"), platformTools);
  await rm(extractRoot, { recursive: true, force: true });
  await rm(archive, { force: true });
}

run(adb, ["version"]);

if (!existsSync(java)) {
  const architecture = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x64" : "";
  if (!architecture) throw new Error(`暂不支持自动安装 Temurin JDK：${process.arch}`);
  const javaOs = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : process.platform;
  const extension = isWindows ? "zip" : "tar.gz";
  const archive = join(downloads, `temurin-17-${process.platform}-${architecture}.${extension}`);
  const extractRoot = join(downloads, `temurin-extract-${process.pid}`);
  const javaUrl = `https://api.adoptium.net/v3/binary/latest/17/ga/${javaOs}/${architecture}/jdk/hotspot/normal/eclipse`;
  await download(javaUrl, archive);
  await rm(extractRoot, { recursive: true, force: true });
  await mkdir(extractRoot, { recursive: true });
  if (isWindows) run(windowsTar, ["-xf", archive, "-C", extractRoot]);
  else run("tar", ["-xzf", archive, "-C", extractRoot]);
  const children = await readdir(extractRoot, { withFileTypes: true });
  const extracted = children.find((entry) => entry.isDirectory());
  if (!extracted) throw new Error("Temurin JDK 解压后没有找到 JDK 目录");
  await rm(javaHome, { recursive: true, force: true });
  await cp(join(extractRoot, extracted.name), javaHome, { recursive: true });
  await rm(extractRoot, { recursive: true, force: true });
  await rm(archive, { force: true });
}
run(java, ["-version"]);
const appiumEntry = join(projectRoot, "node_modules", "appium", "index.js");
const driverEntry = join(projectRoot, "node_modules", "appium-uiautomator2-driver", "package.json");
if (!existsSync(appiumEntry) || !existsSync(driverEntry)) throw new Error("Appium 或 UiAutomator2 Driver 未安装。请先执行 npm ci。");
console.log("Phone 工具链已安装：Android Platform Tools + Temurin JDK 17 + Appium + UiAutomator2 Driver。");
