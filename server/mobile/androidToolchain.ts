import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

function projectPath(value: string) {
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

export function resolveAndroidSdkRoot() {
  const configured = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  return configured ? projectPath(configured) : join(process.cwd(), "data", "toolchain", "android-sdk");
}

export function resolveAdbExecutable() {
  const executable = process.platform === "win32" ? "adb.exe" : "adb";
  const candidates = [
    process.env.ADB_PATH ? projectPath(process.env.ADB_PATH) : "",
    join(resolveAndroidSdkRoot(), "platform-tools", executable),
    join(process.cwd(), "tools", "android-platform-tools", "platform-tools", executable),
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || executable;
}

export function resolveLocalAppiumEntry() {
  const candidates = [
    join(process.cwd(), "node_modules", "appium", "index.js"),
    process.env.USERPROFILE ? join(process.env.USERPROFILE, ".appium", "node_modules", "appium", "build", "lib", "main.js") : "",
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}
