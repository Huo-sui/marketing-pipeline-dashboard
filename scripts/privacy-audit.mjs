import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { run } from "./lib/runtime.mjs";

const listed = run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { capture: true });
const files = (listed.stdout || "").split("\0").filter(Boolean);
const forbiddenPaths = [
  /^(?:\.env|\.env\.(?!example$).+)$/i,
  /^data\/(?!\.gitkeep$)/i,
  /^(?:tmp-|output\/|\.playwright-cli\/)/i,
  /(?:^|\/)(?:Cookies|Login Data|History|Web Data)$/i,
  /\.(?:apk|keystore|p12|pfx|pem)$/i,
];
const textExtensions = new Set(["", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".toml", ".sql", ".prisma", ".ps1", ".css", ".html", ".txt", ".example"]);
const privateNamePatterns = [
  Buffer.from("c29sYXJlYWQ=", "base64").toString("utf8"),
  Buffer.from("bm90IHRoZSByaWdodCBnb2Q=", "base64").toString("utf8").replaceAll(" ", "[ _-]*"),
];
const secretPatterns = [
  { label: "private project name", pattern: new RegExp(privateNamePatterns.join("|"), "i") },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { label: "local Windows user path", pattern: /[A-Za-z]:\\Users\\(?!USER|username|your-name)[^\\\s]+\\/i },
  { label: "local project path", pattern: /[A-Za-z]:\\GameDeveloping\\/i },
  { label: "non-empty secret assignment", pattern: /^(?:ZHIPU_API_KEY|ZAI_API_KEY|BIGMODEL_API_KEY|DOUYIN_API_KEY|REDDIT_API_KEY|X_API_KEY|INSTAGRAM_API_KEY)[ \t]*=[ \t]*(?!your-|YOUR_|<)[^\s#]+/m },
  { label: "GitHub token", pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
];

const findings = [];
for (const file of files) {
  if (forbiddenPaths.some((pattern) => pattern.test(file))) findings.push(`${file}: forbidden runtime/sensitive path`);
  let stat;
  try { stat = statSync(file); } catch { continue; }
  if (!stat.isFile() || stat.size > 2_000_000 || !textExtensions.has(extname(file).toLowerCase())) continue;
  const content = readFileSync(file, "utf8");
  for (const item of secretPatterns) if (item.pattern.test(content)) findings.push(`${file}: ${item.label}`);
}

if (findings.length) {
  console.error("Privacy audit failed:\n" + findings.map((finding) => `- ${finding}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Privacy audit passed (${files.length} publishable files checked).`);
}
