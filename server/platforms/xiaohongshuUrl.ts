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
    const type = new URL(value).searchParams.get("type")?.toLowerCase();
    if (type === "video") return "视频" as const;
    if (type === "normal" || type === "image" || type === "note") return "图文" as const;
  }
  return undefined;
}

export function isXiaohongshuShortUrl(value: string) {
  if (!isAllowedXiaohongshuUrl(value)) return false;
  return exactHosts.has(new URL(value).hostname.toLowerCase().replace(/\.$/, ""));
}

export function isUsableXiaohongshuAccessUrl(value: string) {
  if (!isAllowedXiaohongshuUrl(value)) return false;
  if (isXiaohongshuShortUrl(value)) return true;
  const url = new URL(value);
  return Boolean(xiaohongshuExternalId(value) && url.searchParams.get("xsec_token")?.trim());
}

/**
 * Keep a browser-openable share URL. A bare /explore/:id URL is intentionally
 * rejected because Xiaohongshu currently returns error 300031 without the
 * share access token. Short share links remain valid evidence when their
 * resolved destination supplies the real external ID.
 */
export function xiaohongshuShareAccessUrl(shared: string, resolved: string) {
  if (!isAllowedXiaohongshuUrl(shared) || !isAllowedXiaohongshuUrl(resolved)) return undefined;
  const externalId = xiaohongshuExternalId(resolved) || xiaohongshuExternalId(shared);
  if (!externalId) return undefined;
  const resolvedUrl = new URL(resolved);
  const sharedUrl = new URL(shared);
  if (resolvedUrl.searchParams.has("xsec_token")) return { externalId, canonicalUrl: resolvedUrl.toString() };
  if (sharedUrl.searchParams.has("xsec_token")) return { externalId, canonicalUrl: sharedUrl.toString() };
  if (isXiaohongshuShortUrl(shared)) return { externalId, canonicalUrl: sharedUrl.toString() };
  return undefined;
}
