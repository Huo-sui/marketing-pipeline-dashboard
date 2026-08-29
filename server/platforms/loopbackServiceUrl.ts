export function normalizeLoopbackServiceBaseUrl(value: string | undefined, field: string) {
  if (!value?.trim()) return undefined;
  const url = new URL(value.trim());
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (url.username || url.password) throw new Error(`${field} 不得在 URL 中内嵌凭据`);
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error(`${field} 必须是回环地址`);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}
