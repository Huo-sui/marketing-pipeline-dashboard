export const TIKTOK_DISCOVERY_POLICY = {
  stateMachineVersion: "mobile-discovery-v1",
  mediaTypes: ["any", "video"] as const,
  recentUpload: { stepId: "tiktok_recent_upload", required: false },
  candidateLimitPerTerm: 3 as const,
};

export function tiktokExternalIdFromUrl(url: string) {
  return url.match(/(?:\/(?:video|photo)\/|[?&](?:item_id|aweme_id)=)(\d{8,})/i)?.[1] ?? "";
}

export function tiktokMediaTypeFromUrl(url: string) {
  return /\/photo\/\d{8,}/i.test(url) ? "图文" as const : /\/video\/\d{8,}/i.test(url) || /[?&](?:item_id|aweme_id)=\d{8,}/i.test(url) ? "视频" as const : undefined;
}

export type TikTokSearchCandidate = {
  text: string;
  desc: string;
  fingerprint: string;
  bounds: { left: number; top: number; right: number; bottom: number };
};

function decodeXml(value: string) {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

export function tiktokSearchCandidates(xml: string): TikTokSearchCandidate[] {
  const seen = new Set<string>();
  return [...xml.matchAll(/<node\b[^>]*>/g)].flatMap((match) => {
    const tag = match[0];
    const resourceId = tag.match(/\bresource-id="([^"]*)"/)?.[1] ?? "";
    const text = decodeXml(tag.match(/\btext="([^"]*)"/)?.[1] ?? "");
    const desc = decodeXml(tag.match(/\bcontent-desc="([^"]*)"/)?.[1] ?? "");
    const bounds = tag.match(/\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (tag.match(/\bclickable="([^"]*)"/)?.[1] !== "true" || !bounds || (!/v68/i.test(resourceId) && !/(?:的视频|\bvideo\b)/i.test(desc))) return [];
    const box = { left: Number(bounds[1]), top: Number(bounds[2]), right: Number(bounds[3]), bottom: Number(bounds[4]) };
    const content = (desc || text).replace(/\s+/g, " ").trim();
    const fingerprint = content || `${resourceId}:${box.left}:${box.top}:${box.right}:${box.bottom}`;
    if (seen.has(fingerprint)) return [];
    seen.add(fingerprint);
    return [{ text, desc, fingerprint, bounds: box }];
  }).sort((left, right) => {
    const rowTolerance = Math.max(24, Math.min(left.bounds.bottom - left.bounds.top, right.bounds.bottom - right.bounds.top) * 0.35);
    return Math.abs(left.bounds.top - right.bounds.top) <= rowTolerance ? left.bounds.left - right.bounds.left : left.bounds.top - right.bounds.top;
  });
}
