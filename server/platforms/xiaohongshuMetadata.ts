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
    const date = value.match(/^(?:(\d{4})[-/.年])?(\d{1,2})[-/.月](\d{1,2})(?:日)?(?:\s+.*)?$/);
    if (!date) continue;
    const month = Number(date[2]);
    const day = Number(date[3]);
    const year = date[1] ? Number(date[1]) : (month > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear());
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) return { publishedAt: parsed.toISOString(), evidence: raw };
  }
  return undefined;
}
