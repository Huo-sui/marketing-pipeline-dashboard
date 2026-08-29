import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { run } from "./lib/runtime.mjs";

const scanLocal = process.argv.includes("--local");
const scanHistory = process.argv.includes("--history");
const publishable = run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { capture: true });
const files = new Set((publishable.stdout || "").split("\0").filter(Boolean));
if (scanLocal) {
  const ignored = run("git", ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"], { capture: true });
  for (const file of (ignored.stdout || "").split("\0").filter(Boolean)) files.add(file);
}
const forbiddenPaths = [
  /^(?:\.env|\.env\.(?!example$).+)$/i,
  /^data\/(?!\.gitkeep$)/i,
  /^(?:tmp-|output\/|\.playwright-cli\/)/i,
  /(?:^|\/)(?:Cookies|Login Data|History|Web Data)$/i,
  /\.(?:apk|keystore|p12|pfx|pem)$/i,
];
const textExtensions = new Set(["", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".toml", ".sql", ".prisma", ".ps1", ".css", ".html", ".txt", ".example", ".xml", ".svg", ".log", ".ini", ".sh", ".bat", ".cmd"]);
const secretPatterns = [
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { label: "local Windows user path", pattern: /[A-Za-z]:\\Users\\(?!USER|username|your-name)[^\\\s]+\\/i },
  { label: "local project path", pattern: /[A-Za-z]:\\GameDeveloping\\/i },
  { label: "non-empty secret assignment", pattern: /^(?:[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY))[ \t]*=[ \t]*(?!$|your-|YOUR_|example|EXAMPLE|<|\$\{)[^\s#]+/m },
  { label: "provider access token", pattern: /\b(?:ghp_|github_pat_|glpat-|sk-(?:(?:proj|svcacct)-)?)[A-Za-z0-9_-]{16,}\b/ },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { label: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { label: "URL with embedded credentials", pattern: /\bhttps?:\/\/[^\s/:@]+:[^\s/@]+@[^\s/]+/i },
  { label: "runtime-decoded Base64 literal", pattern: /Buffer\.from\(\s*["'][A-Za-z0-9+/]{8,}={0,2}["']\s*,\s*["']base64["']\s*\)/i },
  { label: "hard-coded Android device serial", pattern: /\b(?:deviceId|deviceSerial|ANDROID_SERIAL)\s*[:=]\s*["'][A-Za-z0-9._:-]{8,64}["']/i },
  { label: "real device serial used as UI example", pattern: /(?:例如|example)\s*[：:]\s*(?!ANDROID_SERIAL\b)[A-Za-z0-9._:-]{8,64}\b/i },
];

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const allowedEmailDomains = new Set(["example.com", "example.org", "example.net", "users.noreply.github.com"]);

const findings = [];
function scanText(location, content) {
  for (const item of secretPatterns) if (item.pattern.test(content)) findings.push(`${location}: ${item.label}`);
  for (const email of content.match(emailPattern) || []) {
    const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
    if (!allowedEmailDomains.has(domain)) findings.push(`${location}: personal email address`);
  }
}

for (const file of files) {
  if (forbiddenPaths.some((pattern) => pattern.test(file))) findings.push(`${file}: forbidden runtime/sensitive path`);
  let stat;
  try { stat = statSync(file); } catch { continue; }
  if (!stat.isFile() || !textExtensions.has(extname(file).toLowerCase())) continue;
  if (scanLocal && stat.size > 20_000_000) continue;
  const buffer = readFileSync(file);
  if (buffer.includes(0)) continue;
  scanText(file, buffer.toString("utf8"));
}

if (scanHistory) {
  const history = run("git", ["log", "--all", "--format=commit:%H", "--no-ext-diff", "--no-renames", "-p", "--", "."], { capture: true, maxBuffer: 50_000_000 });
  scanText("reachable Git history", history.stdout || "");
}

const uniqueFindings = [...new Set(findings)];

if (uniqueFindings.length) {
  console.error("Privacy audit failed:\n" + uniqueFindings.map((finding) => `- ${finding}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Privacy audit passed (${files.size} ${scanLocal ? "publishable and local" : "publishable"} files checked${scanHistory ? ", reachable history checked" : ""}).`);
}
