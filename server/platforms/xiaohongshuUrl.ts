const exactHosts = new Set(["xhslink.cn", "xhslink.com"]);
const parentHosts = ["xiaohongshu.com", "rednote.com"];

export function isAllowedXiaohongshuUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return exactHosts.has(host) || parentHosts.some((parent) => host === parent || host.endsWith(`.${parent}`));
  } catch {
    return false;
  }
}

export function xiaohongshuExternalId(value: string) {
  if (!isAllowedXiaohongshuUrl(value)) return "";
  const url = new URL(value);
  return url.pathname.match(/^\/(?:explore|discovery\/item)\/([a-f0-9]{16,32})(?:\/|$)/i)?.[1]
    ?? url.searchParams.get("noteId")?.match(/^[a-f0-9]{16,32}$/i)?.[0]
    ?? "";
}

export function xiaohongshuMediaTypeHint(...values: string[]) {
  for (const value of values) {
    if (!isAllowedXiaohongshuUrl(value)) continue;
    if (new URL(value).searchParams.get("type")?.toLowerCase() === "video") return "视频" as const;
  }
  return undefined;
}
