import { AndroidPhoneDriver, androidUiNodes, type AndroidUiNode } from "../mobile/androidPhoneDriver.js";
import { parseXiaohongshuPublicationValues } from "./xiaohongshuMetadata.js";
import { isAllowedXiaohongshuUrl, xiaohongshuExternalId, xiaohongshuMediaTypeHint } from "./xiaohongshuUrl.js";

const XHS_PACKAGE = "com.xingin.xhs";

export type XiaohongshuDiscoveryPost = {
  externalId: string; canonicalUrl: string; author: string; title: string; likes: number; comments: number;
  publishedAt: string; mediaType: "视频" | "图文"; term: string; rawPayload: Record<string, unknown>;
  coverEvidence: { bytes: Buffer; mimeType: "image/png"; capturedAt: string; source: "device_screenshot" };
};
export type XiaohongshuDiscoveryLog = { timestamp: string; level: "info" | "warn" | "error"; eventType: string; message: string; term?: string; page?: number; payload?: Record<string, unknown> };
export type XiaohongshuDiscoveryResult = { posts: XiaohongshuDiscoveryPost[]; logs: XiaohongshuDiscoveryLog[] };

function parseMetric(value: string) {
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([万wk])?/i);
  if (!match) return 0;
  const unit = match[2]?.toLowerCase();
  return Math.round(Number(match[1]) * (unit === "万" || unit === "w" ? 10_000 : unit === "k" ? 1_000 : 1));
}

function parseResultCard(node: AndroidUiNode, term: string) {
  const value = node.desc || node.text;
  const structured = value.match(/^(?:(?:笔记|视频|图文)[,\s]+)?(.+?)[,\s]+来自\s*([^,]+?)\s+([\d.,]+\s*[万wk]?)\s*赞$/i);
  const title = structured?.[1]?.trim() || value.split(",")[1]?.trim() || term;
  const author = structured?.[2]?.trim() || "";
  const likes = parseMetric(structured?.[3] ?? "0");
  return { title, author, likes, resultAccessibilityLabel: value };
}

export function parseXiaohongshuPublishedAt(xml: string, now = new Date()) {
  const values = androidUiNodes(xml)
    .flatMap((node) => [node.text, node.desc]);
  // A date embedded in the note body is not publication metadata. Xiaohongshu
  // exposes its metadata as a short standalone accessibility value.
  return parseXiaohongshuPublicationValues(values, now);
}

async function findPublishedAt(driver: AndroidPhoneDriver, initial: string) {
  let xml = initial;
  const size = await driver.size();
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const parsed = parseXiaohongshuPublishedAt(xml);
    if (parsed) return { ...parsed, scrollAttempts: attempt };
    if (attempt < 6) {
      // Foldables render note media on the left and the scrollable body on the
      // right. The same right-side gesture is harmless on ordinary phones.
      await driver.swipe(size.width * 0.76, size.height * 0.78, size.width * 0.76, size.height * 0.3, 500);
      xml = await driver.source();
    }
  }
  return undefined;
}

function parseComments(xml: string) {
  const values = androidUiNodes(xml).flatMap((node) => [node.text, node.desc]).filter(Boolean);
  for (const value of values) {
    const match = value.match(/(?:评论|条评论)[^\d]*([\d.,]+\s*[万wk]?)/i) ?? value.match(/([\d.,]+\s*[万wk]?)\s*(?:条)?评论/i);
    if (match) return parseMetric(match[1]);
  }
  return undefined;
}

async function resolveXhsUrl(raw: string) {
  const shared = raw.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[),，。]+$/, "") ?? "";
  if (!shared || !isAllowedXiaohongshuUrl(shared)) return null;
  let canonicalUrl = shared;
  let externalId = xiaohongshuExternalId(shared);
  if (!externalId) {
    try {
      const response = await fetch(shared, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "Mozilla/5.0" } });
      canonicalUrl = response.url || shared;
      if (!isAllowedXiaohongshuUrl(canonicalUrl)) return null;
      externalId = xiaohongshuExternalId(canonicalUrl);
    } catch { /* the real short URL remains usable below */ }
  }
  // A short-link path is not a real note ID. Keep resolving or reject the
  // candidate; never synthesize an external ID from a tracking URL.
  const mediaTypeHint = xiaohongshuMediaTypeHint(shared, canonicalUrl);
  return externalId ? { externalId, canonicalUrl: `https://www.xiaohongshu.com/explore/${externalId}`, mediaTypeHint } : null;
}

async function dismissKnownOverlays(driver: AndroidPhoneDriver, initial?: string) {
  let xml = initial ?? await driver.source();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const tapped = await driver.tapNode((node) => /^(关闭|我知道了|不再提醒|稍后再说|取消)$/.test(node.text || node.desc), xml);
    if (!tapped) return xml;
    xml = await driver.source();
  }
  return xml;
}

export async function captureXiaohongshuCover(_accountId: string, post: { externalId: string; canonicalUrl: string; author: string; title: string }, deviceId?: string) {
  if (!isAllowedXiaohongshuUrl(post.canonicalUrl) || xiaohongshuExternalId(post.canonicalUrl) !== post.externalId) throw new Error("小红书封面补采拒绝了不匹配的来源链接");
  const driver = await AndroidPhoneDriver.connect(XHS_PACKAGE, "小红书", deviceId);
  await driver.ensureUnlocked();
  await driver.openUri(`xhsdiscover://item/${post.externalId}`, 2_500);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const xml = await dismissKnownOverlays(driver);
    const values = androidUiNodes(xml).flatMap((node) => [node.text, node.desc]).filter(Boolean).join("\n");
    if (/分享|评论|收藏/.test(values)) {
      return { bytes: await driver.screenshot(), mimeType: "image/png" as const, capturedAt: new Date().toISOString(), source: "device_screenshot" as const };
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(`小红书帖子 ${post.externalId} 在 15 秒内没有打开详情页，未保存错误页面截图`);
}

async function openSearch(driver: AndroidPhoneDriver, term: string) {
  await driver.openUri(`xhsdiscover://search/result?keyword=${encodeURIComponent(term)}`, 2_500);
  let xml = await dismissKnownOverlays(driver);
  const size = await driver.size();
  const deadline = Date.now() + 18_000;
  while (Date.now() < deadline) {
    xml = await driver.source();
    if (androidUiNodes(xml).some((node) => /^(综合|最新|用户|商品)$/.test(node.text || node.desc)) && xml.includes(term)) {
      // The result cards begin below Xiaohongshu's AI summary on the default
      // relevance tab. Reveal them while preserving relevance/popularity order.
      await driver.swipe(size.width * 0.5, size.height * 0.86, size.width * 0.5, size.height * 0.25, 500);
      return driver.source();
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(`追踪词 ${term}：输入后 18 秒内没有进入小红书搜索结果页`);
}

async function resultCard(driver: AndroidPhoneDriver, initial: string, candidateIndex: number) {
  let xml = initial;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const nodes = androidUiNodes(xml);
    const cards = nodes.filter((node) => node.bounds && /来自.+[\d.,]+\s*[万wk]?赞/i.test(node.desc));
    if (!cards.length) {
      const size = await driver.size();
      const titles = nodes.filter((node) => {
        if (!node.bounds || node.className !== "android.widget.TextView") return false;
        const width = node.bounds.right - node.bounds.left;
        return node.text.length >= 8 && width >= size.width * 0.2 && width <= size.width * 0.36 && node.bounds.top > size.height * 0.18
          && !/^(大家都在搜|相关搜索|综合|最新|有声书|推荐简单|精读方法)/.test(node.text);
      });
      for (const title of titles) {
        if (!title.bounds) continue;
        const column = nodes.filter((node) => node.bounds && node.bounds.left >= title.bounds!.left - 40 && node.bounds.right <= title.bounds!.right + 80 && node.bounds.top >= title.bounds!.bottom && node.bounds.top <= title.bounds!.bottom + 260);
        const author = column.find((node) => node.text && node.text.length > 1 && !/^(?:\d+(?:\.\d+)?[万wk]?|赞|刚刚|\d+[天小时分钟]前|昨天)/i.test(node.text))?.text ?? "";
        const metricNode = column.find((node) => /^(?:\d+(?:\.\d+)?[万wk]?|赞)$/i.test(node.text));
        const likes = metricNode?.text === "赞" ? 0 : parseMetric(metricNode?.text ?? "0");
        cards.push({ ...title, desc: `笔记 ${title.text} 来自${author} ${likes}赞` });
      }
      cards.sort((left, right) => parseResultCard(right, "").likes - parseResultCard(left, "").likes);
    }
    const card = cards[candidateIndex];
    const bounds = card?.bounds;
    if (card && bounds) {
      await driver.tap((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2, 1_800);
      return card;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    xml = await driver.source();
  }
  return null;
}

async function copyOpenedNoteLink(driver: AndroidPhoneDriver) {
  const tapCopyAction = async (timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const xml = await driver.source();
      const copyNodes = androidUiNodes(xml)
        .filter((node) => node.bounds && /^(复制链接|Copy link)$/i.test(node.text || node.desc))
        .sort((left, right) => {
          const leftArea = left.bounds ? (left.bounds.right - left.bounds.left) * (left.bounds.bottom - left.bounds.top) : 0;
          const rightArea = right.bounds ? (right.bounds.right - right.bounds.left) * (right.bounds.bottom - right.bounds.top) : 0;
          return rightArea - leftArea;
        });
      const copy = copyNodes[0]?.bounds;
      if (copy) {
        await driver.tap((copy.left + copy.right) / 2, (copy.top + copy.bottom) / 2, 900);
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    return false;
  };
  let xml = await driver.source();
  // Keep Appium out of the UI phase. On Android 16 its accessibility session can
  // briefly return stale Xiaohongshu trees; it is only needed to read clipboard.
  const share = await driver.tapNode((node) => /^(分享|分享笔记|更多)$/.test(node.text || node.desc), xml);
  if (!share) {
    const size = await driver.size();
    await driver.tap(size.width * 0.93, size.height * 0.075, 1_400);
  }
  let copied = await tapCopyAction(8_000);
  if (!copied) {
    // Reading a long note can collapse the top action bar. Restore the note to
    // the top and retry the platform share affordance before declaring failure.
    const size = await driver.size();
    for (let attempt = 0; attempt < 5; attempt += 1) await driver.swipe(size.width * 0.76, size.height * 0.3, size.width * 0.76, size.height * 0.82, 450);
    xml = await driver.source();
    const restoredShare = await driver.tapNode((node) => /^(分享|分享笔记|更多)$/.test(node.text || node.desc), xml);
    if (!restoredShare) await driver.tap(size.width * 0.93, size.height * 0.075, 1_400);
    copied = await tapCopyAction(8_000);
  }
  if (!copied) throw new Error("小红书分享面板没有暴露“复制链接”操作");
  try {
    const clipboardDeadline = Date.now() + 12_000;
    while (Date.now() < clipboardDeadline) {
      const rawClipboard = await driver.clipboard();
      const resolved = await resolveXhsUrl(rawClipboard);
      if (resolved) return { ...resolved, rawClipboard };
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } finally {
    await driver.releaseAppiumSession();
  }
  throw new Error("已点击复制链接，但剪贴板没有返回可解析的小红书真实 URL");
}

export async function discoverXiaohongshu(_accountId: string, terms: string[], deviceId?: string): Promise<XiaohongshuDiscoveryResult> {
  const driver = await AndroidPhoneDriver.connect(XHS_PACKAGE, "小红书", deviceId);
  const posts: XiaohongshuDiscoveryPost[] = [];
  const logs: XiaohongshuDiscoveryLog[] = [];
  const log = (level: XiaohongshuDiscoveryLog["level"], eventType: string, message: string, term?: string, payload?: Record<string, unknown>) => logs.push({ timestamp: new Date().toISOString(), level, eventType, message, term, page: term ? 1 : undefined, payload });
  for (const term of terms) {
    log("info", "term_started", `开始搜索关键词：${term}`, term);
    try {
      let captured = false;
      let lastError: unknown;
      for (let candidateIndex = 0; candidateIndex < 3 && !captured; candidateIndex += 1) {
        try {
          const home = await driver.launch();
          await dismissKnownOverlays(driver, home);
          const results = await openSearch(driver, term);
          const card = await resultCard(driver, results, candidateIndex);
          if (!card) throw new Error(`第 ${candidateIndex + 1} 个候选不可点击`);
          const cardData = parseResultCard(card, term);
          const detail = await driver.source();
          const coverEvidence = { bytes: await driver.screenshot(), mimeType: "image/png" as const, capturedAt: new Date().toISOString(), source: "device_screenshot" as const };
          const comments = parseComments(detail);
          if (comments === undefined) throw new Error("未采集到评论数");
          const publication = await findPublishedAt(driver, detail);
          if (!publication) throw new Error("未采集到发布时间");
          const link = await copyOpenedNoteLink(driver);
          const mediaType = link.mediaTypeHint ?? "图文" as const;
          const post: XiaohongshuDiscoveryPost = { externalId: link.externalId, canonicalUrl: link.canonicalUrl, author: cardData.author, title: cardData.title, likes: cardData.likes, comments, publishedAt: publication.publishedAt, mediaType, term, rawPayload: { source: "xiaohongshu-android-share-link", term, resultAccessibilityLabel: cardData.resultAccessibilityLabel, publicationEvidence: publication.evidence, publicationScrollAttempts: publication.scrollAttempts, shareLinkResolved: true, coverEvidence: { source: coverEvidence.source, mimeType: coverEvidence.mimeType, capturedAt: coverEvidence.capturedAt } }, coverEvidence };
          const missingChecklist = [!post.externalId && "真实 externalId", !post.canonicalUrl && "真实链接", !post.author && "作者", !post.title && "标题", !Number.isFinite(post.likes) && "点赞数", !Number.isFinite(post.comments) && "评论数", !post.publishedAt && "发布时间", !post.mediaType && "媒体类型", !post.term && "命中词", !post.coverEvidence.bytes.length && "截图封面"].filter((item): item is string => Boolean(item));
          if (missingChecklist.length) throw new Error(`字段清单未完成：${missingChecklist.join("、")}`);
          log("info", "candidate_read", `读取候选：${cardData.title}，点赞 ${cardData.likes}，评论 ${comments}，发布于 ${publication.publishedAt}`, term, { likes: cardData.likes, comments, publishedAt: publication.publishedAt, publicationEvidence: publication.evidence, checklistComplete: true });
          posts.push(post);
          log("info", "candidate_captured", "字段清单完整，已取得真实分享链接和截图封面", term, { externalId: link.externalId, canonicalUrl: link.canonicalUrl, coverCapturedAt: coverEvidence.capturedAt, checklistComplete: true });
          log("info", "term_completed", `关键词完成：取得 1 条字段完整的真实笔记`, term, { captured: 1 });
          captured = true;
        } catch (error) {
          lastError = error;
          log("warn", "candidate_incomplete", `候选 ${candidateIndex + 1} 采集未完成，尝试下一个候选：${error instanceof Error ? error.message : "未知字段错误"}`, term, { candidateIndex });
        }
      }
      if (!captured) throw lastError instanceof Error ? lastError : new Error(`追踪词 ${term} 没有字段完整的候选`);
    } catch (error) {
      log("error", "search_failed", error instanceof Error ? error.message : `追踪词 ${term} 的小红书采集失败`, term);
    }
  }
  log("info", "run_completed", `小红书搜索完成：共取得 ${posts.length} 条真实分享链接`, undefined, { posts: posts.length });
  return { posts, logs };
}
