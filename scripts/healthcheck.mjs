import { readEnvFile } from "./lib/runtime.mjs";

const env = readEnvFile();
const port = /^\d{2,5}$/.test(env.MARKETING_PIPELINE_PORT || "") ? env.MARKETING_PIPELINE_PORT : "3210";
const url = `http://127.0.0.1:${port}/api/v1/health`;
const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
const body = await response.text();
if (!response.ok) throw new Error(`健康检查失败：HTTP ${response.status} ${body}`);
console.log(`${url} ${body}`);
