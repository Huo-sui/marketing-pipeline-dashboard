export function parseXiaohongshuPublicationValues(values: string[], now = new Date()) {
  const candidates = values
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 0 && value.length <= 48);
  for (const raw of candidates) {
    const value = raw.replace(/^(?:发布于|编辑于)\s*/, "");
    if (value === "刚刚") return { publishedAt: now.toISOString(), evidence: raw };
    const relative = value.match(/^(\d+)\s*(分钟|小时|天|周)前(?:\s+.*)?$/);
    if (relative) {
      const amount = Number(relative[1]);
      const ms = relative[2] === "分钟" ? 60_000 : relative[2] === "小时" ? 3_600_000 : relative[2] === "天" ? 86_400_000 : 604_800_000;
      return { publishedAt: new Date(now.getTime() - amount * ms).toISOString(), evidence: raw };
    }
    if (/^昨天(?:\s+\d{1,2}:\d{2})?(?:\s+.*)?$/.test(value)) return { publishedAt: new Date(now.getTime() - 86_400_000).toISOString(), evidence: raw };
    if (/^前天(?:\s+\d{1,2}:\d{2})?(?:\s+.*)?$/.test(value)) return { publishedAt: new Date(now.getTime() - 172_800_000).toISOString(), evidence: raw };
    // Bare slash values such as 1/5 are the media carousel position, not a
    // publication date. Xiaohongshu's date metadata uses -, ., 年/月 or an
    // explicit 发布于/编辑于 prefix; never promote an image counter to evidence.
    const prefixed = /^(?:发布于|编辑于)\s*/.test(raw);
    const date = value.match(/^(?:(\d{4})[-.年])?(\d{1,2})[-.月](\d{1,2})(?:日)?(?:\s+.*)?$/)
      ?? (prefixed ? value.match(/^(?:(\d{4})[/.年])?(\d{1,2})[/.月](\d{1,2})(?:日)?(?:\s+.*)?$/) : null);
    if (!date) continue;
    const month = Number(date[2]);
    const day = Number(date[3]);
    const year = date[1] ? Number(date[1]) : (month > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear());
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) return { publishedAt: parsed.toISOString(), evidence: raw };
  }
  return undefined;
}

function normalizedNoteText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isDetailChrome(value: string, author: string) {
  if (!value || value === author) return true;
  if (/^(?:分享|分享笔记|收藏|赞|评论|关注|展开|收起|更多|复制链接|打开看看|说点什么|作者赞过|还没有评论|搜索|首页|发现)$/.test(value)) return true;
  if (/^(?:\d+(?:\.\d+)?[万wk]?|\d+\/\d+)$/i.test(value)) return true;
  if (/^(?:发布于|编辑于)?\s*(?:刚刚|昨天|前天|\d+\s*(?:分钟|小时|天|周)前|(?:\d{4}[-.年])?\d{1,2}[-.月]\d{1,2}日?)(?:\s+.*)?$/.test(value)) return true;
  if (/来自\s*.+\s+[\d.,]+\s*[万wk]?\s*赞$/i.test(value)) return true;
  return false;
}

/**
 * Split the note title and body only from detail-page accessibility values.
 * The result-card label is used as corroborating evidence, never as a fallback
 * that silently promotes a combined title/body snippet to the title field.
 */
export function parseXiaohongshuNoteContent(values: string[], resultAccessibilityLabel: string, author: string) {
  const cardContent = normalizedNoteText(resultAccessibilityLabel)
    .replace(/^(?:(?:笔记|视频|图文)[,，\s]+)?/, "")
    .replace(/[,，\s]+来自\s*.+?\s+[\d.,]+\s*[万wk]?\s*赞$/i, "")
    .trim();
  if (!cardContent) return undefined;

  const candidates = [...new Set(values.map(normalizedNoteText))]
    .filter((value) => value.length >= 2 && !isDetailChrome(value, author))
    .filter((value) => cardContent.includes(value) || (value.length >= 12 && cardContent.includes(value.slice(0, Math.min(32, value.length)))));

  // Accessibility parents sometimes repeat the concatenated text of their
  // children. Prefer the leaf title/body values so their boundary is real.
  const leaves = candidates.filter((candidate) => {
    const contained = candidates.filter((other) => other !== candidate && candidate.includes(other));
    return contained.length < 2;
  });
  if (leaves.length < 2) return undefined;

  const ordered = leaves.sort((left, right) => {
    const leftIndex = cardContent.indexOf(left.slice(0, Math.min(left.length, 32)));
    const rightIndex = cardContent.indexOf(right.slice(0, Math.min(right.length, 32)));
    return leftIndex - rightIndex;
  });
  const title = ordered[0];
  const body = ordered.slice(1).filter((value) => value !== title).join("\n").trim();
  if (!title || !body || title === body) return undefined;
  return { title, body, evidence: ordered };
}
