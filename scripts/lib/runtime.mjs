import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const isWindows = process.platform === "win32";
export const npmCommand = process.execPath;
export const dockerCommand = isWindows ? "docker.exe" : "docker";
const npmCli = process.env.npm_execpath || join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
export const npmArguments = (args) => [npmCli, ...args];

export function readEnvFile(path = join(projectRoot, ".env")) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}

export function runtimeEnv(extra = {}) {
  const env = { ...process.env, ...readEnvFile(), ...extra };
  const sdkRoot = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || join(projectRoot, "data", "toolchain", "android-sdk");
  env.ANDROID_HOME = isAbsolute(sdkRoot) ? sdkRoot : resolve(projectRoot, sdkRoot);
  env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
  const adbName = isWindows ? "adb.exe" : "adb";
  const localAdb = join(env.ANDROID_HOME, "platform-tools", adbName);
  if (!env.ADB_PATH && existsSync(localAdb)) env.ADB_PATH = localAdb;
  const localJavaHome = join(projectRoot, "data", "toolchain", "jdk-17");
  if (!env.JAVA_HOME && existsSync(join(localJavaHome, "bin", isWindows ? "java.exe" : "java"))) env.JAVA_HOME = localJavaHome;
  const pathParts = [join(env.ANDROID_HOME, "platform-tools")];
  if (env.JAVA_HOME) pathParts.push(join(env.JAVA_HOME, "bin"));
  const existingPath = Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1] || "";
  for (const key of Object.keys(env)) if (key.toLowerCase() === "path") delete env[key];
  env[isWindows ? "Path" : "PATH"] = [...pathParts, existingPath].join(isWindows ? ";" : ":");
  return env;
}

export function commandExists(command) {
  const lookup = isWindows ? "where.exe" : "which";
  return spawnSync(lookup, [command], { windowsHide: true, stdio: "ignore" }).status === 0;
}

export function run(command, args, options = {}) {
  const { capture = false, allowFailure = false, env: extraEnv, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: runtimeEnv(extraEnv),
    windowsHide: true,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    shell: isWindows && /\.(?:cmd|bat)$/i.test(command),
    ...spawnOptions,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const detail = capture ? `\n${result.stderr || result.stdout || ""}` : "";
    throw new Error(`${command} ${args.join(" ")} 执行失败（exit ${result.status}）${detail}`);
  }
  return result;
}

export function spawnLongRunning(command, args, options = {}) {
  const { env: extraEnv, ...spawnOptions } = options;
  return spawn(command, args, {
    cwd: projectRoot,
    env: runtimeEnv(extraEnv),
    windowsHide: true,
    stdio: "inherit",
    shell: isWindows && /\.(?:cmd|bat)$/i.test(command),
    ...spawnOptions,
  });
}

export function redactSerial(serial) {
  if (!serial) return "";
  return serial.length <= 4 ? "****" : `${serial.slice(0, 2)}…${serial.slice(-2)}`;
}
