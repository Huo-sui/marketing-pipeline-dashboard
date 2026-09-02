export type XiaohongshuMediaTypeFilter = "any" | "video" | "image_text";

export type XiaohongshuVisualCard = {
  text: string;
  desc: string;
  selected?: boolean;
  checked?: boolean;
  bounds?: { left: number; top: number; right: number; bottom: number };
};

export type XiaohongshuFilterGroup = "sort" | "media" | "age" | "seen";

function comparableDetailText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/^@/, "").replace(/\s+/g, "");
}

export function xiaohongshuDetailMatchesPost(values: string[], post: { author: string; title: string }) {
  const haystack = comparableDetailText(values.filter(Boolean).join("\n"));
  const title = comparableDetailText(post.title);
  const author = comparableDetailText(post.author);
  const titleProbe = title.length > 24 ? title.slice(0, 24) : title;
  return Boolean(titleProbe && author && haystack.includes(titleProbe) && haystack.includes(author));
}

const groupPatterns: Record<XiaohongshuFilterGroup, RegExp> = {
  sort: /^(?:排序依据|排序方式|排序)$/,
  media: /^(?:笔记类型|内容类型|作品类型)$/,
  age: /^(?:发布时间|发布时间范围|时间范围)$/,
  seen: /^(?:浏览范围|浏览状态|观看状态)$/,
};

export function xiaohongshuFilterLabels(mediaTypeFilter: XiaohongshuMediaTypeFilter) {
  const media = mediaTypeFilter === "video" ? "视频" : mediaTypeFilter === "image_text" ? "图文" : "不限";
  return { sort: "最多点赞", age: "一周内", seen: "未看过", media } as const;
}

export function xiaohongshuCardFingerprint(node: XiaohongshuVisualCard) {
  return (node.desc || node.text).replace(/\s+/g, " ").trim();
}

export function findXiaohongshuFilterOption<T extends XiaohongshuVisualCard>(nodes: T[], label: string, group: XiaohongshuFilterGroup) {
  const candidates = nodes.filter((node) => node.bounds && (node.text || node.desc) === label);
  if (candidates.length <= 1) return candidates[0];
  const headings = nodes
    .filter((node) => node.bounds && Object.values(groupPatterns).some((pattern) => pattern.test(node.text || node.desc)))
    .sort((left, right) => left.bounds!.top - right.bounds!.top);
  const heading = headings.find((node) => groupPatterns[group].test(node.text || node.desc));
  if (!heading?.bounds) return undefined;
  const nextHeading = headings.find((node) => node.bounds!.top > heading.bounds!.top);
  return candidates.find((node) => node.bounds!.top >= heading.bounds!.bottom && (!nextHeading || node.bounds!.top < nextHeading.bounds!.top));
}

export function xiaohongshuMediaTypeFromEvidence(cardAccessibilityLabel: string, linkHint?: "视频" | "图文") {
  if (linkHint) return linkHint;
  const normalized = cardAccessibilityLabel.trim();
  if (/^视频(?:[,，\s]|$)/.test(normalized)) return "视频" as const;
  if (/^(?:笔记|图文)(?:[,，\s]|$)/.test(normalized)) return "图文" as const;
  return undefined;
}

export function sortXiaohongshuCardsVisualOrder<T extends XiaohongshuVisualCard>(cards: T[]) {
  return [...cards].sort((left, right) => {
    const a = left.bounds!;
    const b = right.bounds!;
    const rowTolerance = Math.max(24, Math.min(a.bottom - a.top, b.bottom - b.top) * 0.35);
    return Math.abs(a.top - b.top) <= rowTolerance ? a.left - b.left : a.top - b.top;
  });
}
