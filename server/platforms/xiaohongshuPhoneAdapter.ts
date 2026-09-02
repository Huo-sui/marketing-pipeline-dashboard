import { AndroidPhoneDriver, androidUiNodes, type AndroidUiNode } from "../mobile/androidPhoneDriver.js";
import { runDiscoveryStateMachine, type DiscoveryMachineContext, type DiscoveryMediaTypeFilter, type PlatformDiscoveryPlan, type PlatformDiscoveryRequest } from "../mobile/discoveryStateMachine.js";
import { parseXiaohongshuNoteContent, parseXiaohongshuPublicationValues } from "./xiaohongshuMetadata.js";
import { isAllowedXiaohongshuUrl, xiaohongshuExternalId, xiaohongshuMediaTypeHint, xiaohongshuShareAccessUrl } from "./xiaohongshuUrl.js";
import { findXiaohongshuFilterOption, sortXiaohongshuCardsVisualOrder, xiaohongshuCardFingerprint, xiaohongshuDetailMatchesPost, xiaohongshuFilterLabels, xiaohongshuMediaTypeFromEvidence, type XiaohongshuFilterGroup } from "./xiaohongshuDiscoveryPolicy.js";

const XHS_PACKAGE = "com.xingin.xhs";

export type XiaohongshuDiscoveryPost = {
  externalId: string; canonicalUrl: string; author: string; title: string; body: string; likes: number; comments: number;
  publishedAt: string; mediaType: "视频" | "图文"; term: string; rawPayload: Record<string, unknown>;
  coverEvidence: { bytes: Buffer; mimeType: "image/png"; capturedAt: string; source: "device_screenshot" };
};
export type XiaohongshuDiscoveryLog = { timestamp: string; level: "info" | "warn" | "error"; eventType: string; message: string; term?: string; page?: number; payload?: Record<string, unknown> };
export type XiaohongshuDiscoveryResult = { posts: XiaohongshuDiscoveryPost[]; logs: XiaohongshuDiscoveryLog[] };

function parseMetric(value: string) {
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([万wk])?/i);
  if (!match) return undefined;
  const unit = match[2]?.toLowerCase();
  return Math.round(Number(match[1]) * (unit === "万" || unit === "w" ? 10_000 : unit === "k" ? 1_000 : 1));
}

function parseResultCard(node: AndroidUiNode) {
  const value = node.desc || node.text;
  const structured = value.match(/^(?:(?:笔记|视频|图文)[,\s]+)?(.+?)[,\s]+来自\s*([^,]+?)\s+([\d.,]+\s*[万wk]?)\s*赞$/i);
  const title = structured?.[1]?.trim() || value.split(",")[1]?.trim();
  const author = structured?.[2]?.trim() || "";
  const likes = structured?.[3] ? parseMetric(structured[3]) : undefined;
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
  let resolvedUrl = shared;
  let access = xiaohongshuShareAccessUrl(shared, resolvedUrl);
  if (!access) {
    try {
      const response = await fetch(shared, { redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "Mozilla/5.0" } });
      resolvedUrl = response.url || shared;
      access = xiaohongshuShareAccessUrl(shared, resolvedUrl);
    } catch { /* the real short URL remains usable below */ }
  }
  // A short-link path is not a real note ID. Keep resolving or reject the
  // candidate; never synthesize an external ID from a tracking URL.
  if (!access) return null;
  const mediaTypeHint = xiaohongshuMediaTypeHint(shared, resolvedUrl);
  return { ...access, shareUrl: shared, resolvedUrl, mediaTypeHint };
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
  const embeddedExternalId = xiaohongshuExternalId(post.canonicalUrl);
  if (!isAllowedXiaohongshuUrl(post.canonicalUrl) || (embeddedExternalId && embeddedExternalId !== post.externalId)) throw new Error("小红书封面补采拒绝了不匹配的来源链接");
  const driver = await AndroidPhoneDriver.connect(XHS_PACKAGE, "小红书", deviceId);
  await driver.ensureUnlocked();
  await driver.openUri(`xhsdiscover://item/${post.externalId}`, 2_500);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const xml = await dismissKnownOverlays(driver);
    const values = androidUiNodes(xml).flatMap((node) => [node.text, node.desc]).filter(Boolean);
    if (/分享|评论|收藏/.test(values.join("\n")) && xiaohongshuDetailMatchesPost(values, post)) {
      return { bytes: await driver.screenshot(), mimeType: "image/png" as const, capturedAt: new Date().toISOString(), source: "device_screenshot" as const };
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(`小红书帖子 ${post.externalId} 在 15 秒内未确认目标标题与作者，未保存错误或串页截图`);
}

async function openSearch(driver: AndroidPhoneDriver, term: string) {
  let xml = await dismissKnownOverlays(driver);
  const searchInput = androidUiNodes(xml).find((node) => node.bounds && node.className === "android.widget.EditText");
  if (searchInput?.bounds) {
    await driver.tap((searchInput.bounds.left + searchInput.bounds.right) / 2, (searchInput.bounds.top + searchInput.bounds.bottom) / 2);
  } else {
    const opened = await driver.tapNode((node) => /^(搜索|Search)$/.test(node.text || node.desc), xml);
    if (!opened) {
      const size = await driver.size();
      await driver.tap(size.width * 0.9, size.height * 0.075);
    }
  }
  const inputDeadline = Date.now() + 8_000;
  let inputReady = false;
  while (Date.now() < inputDeadline) {
    xml = await driver.source();
    const input = androidUiNodes(xml).find((node) => node.bounds && node.className === "android.widget.EditText");
    if (input?.bounds) {
      await driver.tap((input.bounds.left + input.bounds.right) / 2, (input.bounds.top + input.bounds.bottom) / 2, 300);
      inputReady = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!inputReady) throw new Error(`追踪词 ${term}：小红书搜索框在 8 秒内没有进入可输入状态`);
  await driver.replaceFocusedText(term);
  await driver.key("ENTER");
  const deadline = Date.now() + 18_000;
  while (Date.now() < deadline) {
    xml = await driver.source();
    if (androidUiNodes(xml).some((node) => /^(综合|最新|用户|商品)$/.test(node.text || node.desc)) && xml.includes(term)) {
      return xml;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(`追踪词 ${term}：输入后 18 秒内没有进入小红书搜索结果页`);
}

function resultCards(xml: string, size: { width: number; height: number }) {
  const nodes = androidUiNodes(xml);
  const cards = nodes.filter((node) => node.bounds && /来自.+[\d.,]+\s*[万wk]?赞/i.test(node.desc));
  if (!cards.length) {
    const titles = nodes.filter((node) => {
      if (!node.bounds || node.className !== "android.widget.TextView") return false;
      const width = node.bounds.right - node.bounds.left;
      return node.text.length >= 8 && width >= size.width * 0.2 && width <= size.width * 0.46 && node.bounds.top > size.height * 0.18
        && !/^(大家都在搜|相关搜索|综合|最新|有声书|推荐简单|精读方法)/.test(node.text);
    });
    for (const title of titles) {
      const column = nodes.filter((node) => node.bounds && node.bounds.left >= title.bounds!.left - 40 && node.bounds.right <= title.bounds!.right + 80 && node.bounds.top >= title.bounds!.bottom && node.bounds.top <= title.bounds!.bottom + 260);
      const author = column.find((node) => node.text && node.text.length > 1 && !/^(?:\d+(?:\.\d+)?[万wk]?|赞|刚刚|\d+[天小时分钟]前|昨天)/i.test(node.text))?.text ?? "";
      const metricNode = column.find((node) => /^(?:\d+(?:\.\d+)?[万wk]?|赞)$/i.test(node.text));
      const likes = metricNode?.text === "赞" ? 0 : parseMetric(metricNode?.text ?? "0");
      cards.push({ ...title, desc: `笔记 ${title.text} 来自${author} ${likes}赞` });
    }
  }
  return sortXiaohongshuCardsVisualOrder(cards.filter((card) => card.bounds));
}

async function nextResultCard(driver: AndroidPhoneDriver, visited: Set<string>) {
  let xml = await driver.source();
  const deadline = Date.now() + 20_000;
  let revealed = false;
  while (Date.now() < deadline) {
    const size = await driver.size();
    const cards = resultCards(xml, size);
    const card = cards.find((item) => !visited.has(xiaohongshuCardFingerprint(item)));
    if (card) return card;
    if (!cards.length && !revealed) {
      revealed = true;
      await driver.swipe(size.width * 0.5, size.height * 0.86, size.width * 0.5, size.height * 0.25, 500);
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    xml = await driver.source();
  }
  return null;
}

async function applyAndVerifyFilters(driver: AndroidPhoneDriver, mediaTypeFilter: DiscoveryMediaTypeFilter) {
  let xml = await driver.source();
  const opened = await driver.tapNode((node) => /^(全部|筛选)$/.test(node.text || node.desc), xml);
  if (!opened) throw new Error("小红书搜索结果页未找到“全部/筛选”入口");
  const labels = xiaohongshuFilterLabels(mediaTypeFilter);
  const selectedOptions: Array<{ label: string; centerX: number; centerY: number }> = [];
  for (const [group, label] of [["sort", labels.sort], ["media", labels.media], ["age", labels.age], ["seen", labels.seen]] as const satisfies ReadonlyArray<readonly [XiaohongshuFilterGroup, string]>) {
    xml = await driver.source();
    const nodes = androidUiNodes(xml);
    const option = findXiaohongshuFilterOption(nodes, label, group);
    if (!option?.bounds) throw new Error(`小红书筛选面板未找到“${label}”`);
    const centerX = (option.bounds.left + option.bounds.right) / 2;
    const centerY = (option.bounds.top + option.bounds.bottom) / 2;
    selectedOptions.push({ label, centerX, centerY });
    await driver.tap(centerX, centerY);
  }
  xml = await driver.source();
  const nodes = androidUiNodes(xml);
  const unconfirmed = selectedOptions.filter(({ label, centerX, centerY }) => {
    const option = nodes
      .filter((node) => node.bounds && (node.text || node.desc) === label)
      .sort((left, right) => {
        const leftDistance = Math.hypot(
          ((left.bounds!.left + left.bounds!.right) / 2) - centerX,
          ((left.bounds!.top + left.bounds!.bottom) / 2) - centerY,
        );
        const rightDistance = Math.hypot(
          ((right.bounds!.left + right.bounds!.right) / 2) - centerX,
          ((right.bounds!.top + right.bounds!.bottom) / 2) - centerY,
        );
        return leftDistance - rightDistance;
      })[0];
    return !option || (!option.selected && !option.checked);
  });
  if (unconfirmed.length) throw new Error(`小红书筛选值未实际选中：${unconfirmed.map((item) => item.label).join("、")}`);
  const closed = await driver.tapNode((node) => /^(确定|确认|完成|收起)$/.test(node.text || node.desc), xml);
  if (!closed) await driver.key("BACK");
  return labels;
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

type XiaohongshuMachinePlatform = {
  driver: AndroidPhoneDriver;
  currentCard?: AndroidUiNode;
  currentCardData?: ReturnType<typeof parseResultCard>;
  currentDetail?: string;
  filtersVerified: boolean;
  normalLaunches: number;
  recoveryLaunches: number;
};

async function waitForResults(driver: AndroidPhoneDriver, term: string, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const xml = await driver.source();
    if (xml.includes(term) && androidUiNodes(xml).some((node) => /^(综合|最新|用户|商品)$/.test(node.text || node.desc))) return true;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return false;
}

async function restoreXiaohongshuResults(context: DiscoveryMachineContext<XiaohongshuDiscoveryPost, XiaohongshuMachinePlatform>) {
  const { driver } = context.platform;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await driver.key("BACK");
    if (context.term && await waitForResults(driver, context.term, 4_000)) return;
  }
  if (!context.term) throw new Error("恢复结果页时缺少追踪词");
  try {
    await openSearch(driver, context.term);
    await applyAndVerifyFilters(driver, context.request.policy.mediaTypeFilter);
    context.log("info", "results_reanchored", "已重新锚定同一追踪词并重放筛选", { recoveryRestartedApp: false });
    return;
  } catch {
    const home = await driver.launch();
    context.platform.recoveryLaunches += 1;
    await dismissKnownOverlays(driver, home);
    await openSearch(driver, context.term);
    await applyAndVerifyFilters(driver, context.request.policy.mediaTypeFilter);
    context.log("warn", "results_reanchored", "结果页恢复失败后重启 App，并重放同一追踪词筛选", { recoveryRestartedApp: true });
  }
}

function xhsPlan(): PlatformDiscoveryPlan<XiaohongshuDiscoveryPost, XiaohongshuMachinePlatform> {
  return {
    version: "mobile-discovery-v1",
    session: [{ id: "xhs_session_ready", state: "session_ready", required: true, timeout: 35_000, attempts: 1, async execute(context) { const home = await context.platform.driver.launch(); context.platform.normalLaunches += 1; await dismissKnownOverlays(context.platform.driver, home); context.log("info", "app_session_started", "小红书本次运行正常启动一次", { normalLaunches: context.platform.normalLaunches }); } }],
    term: [
      { id: "xhs_term_prepare", state: "term_prepare", required: true, timeout: 10_000, attempts: 1, async execute(context) { await dismissKnownOverlays(context.platform.driver); context.platform.filtersVerified = false; context.platform.currentCard = undefined; } },
      { id: "xhs_query_submit", state: "query_submitted", required: true, timeout: 25_000, attempts: 2, async execute(context) { await openSearch(context.platform.driver, context.term!); }, recover: async (context) => { await context.platform.driver.key("BACK"); } },
      { id: "xhs_results_ready", state: "results_ready", required: true, timeout: 20_000, attempts: 1, async execute(context) { if (!await waitForResults(context.platform.driver, context.term!, 18_000)) throw new Error(`追踪词 ${context.term} 的结果页未就绪`); } },
      { id: "xhs_filters_apply", state: "filters_apply", required: true, timeout: 30_000, attempts: 2, async execute(context) { const labels = await applyAndVerifyFilters(context.platform.driver, context.request.policy.mediaTypeFilter); context.platform.filtersVerified = true; context.log("info", "filters_applied", "已设置最多点赞、笔记类型、一周内、未看过", labels); }, recover: async (context) => { await context.platform.driver.key("BACK"); await openSearch(context.platform.driver, context.term!); } },
      { id: "xhs_filters_verify", state: "filters_verify", required: true, timeout: 2_000, attempts: 1, async execute() {}, verify: (context) => context.platform.filtersVerified },
    ],
    candidate: [
      { id: "xhs_candidate_scan", state: "candidate_scan", required: true, timeout: 22_000, attempts: 1, async execute(context) { const card = await nextResultCard(context.platform.driver, context.visitedFingerprints); if (!card) throw new Error("结果页没有更多未访问候选"); const fingerprint = xiaohongshuCardFingerprint(card); context.visitedFingerprints.add(fingerprint); context.platform.currentCard = card; context.platform.currentCardData = parseResultCard(card); context.log("info", "candidate_scanned", `按视觉顺序选择候选 ${context.candidateIndex + 1}`, { candidateIndex: context.candidateIndex, fingerprint }); } },
      { id: "xhs_candidate_open", state: "candidate_open", required: true, timeout: 30_000, attempts: 1, async execute(context) { const bounds = context.platform.currentCard?.bounds; if (!bounds) throw new Error("候选缺少可点击坐标"); await context.platform.driver.tap((bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2, 1_200); const deadline = Date.now() + 20_000; while (Date.now() < deadline) { const xml = await context.platform.driver.source(); if (/分享|评论|收藏/.test(androidUiNodes(xml).flatMap((node) => [node.text, node.desc]).join("\n"))) { context.platform.currentDetail = xml; return; } await new Promise((resolve) => setTimeout(resolve, 700)); } throw new Error("候选详情页在 20 秒内未就绪"); }, recover: restoreXiaohongshuResults },
      { id: "xhs_candidate_extract", state: "candidate_extract", required: true, timeout: 90_000, attempts: 1, async execute(context) { const cardData = context.platform.currentCardData!; const detail = context.platform.currentDetail!; if (!cardData.author || !cardData.title || cardData.likes === undefined) throw new Error("卡片字段不完整：作者、标题或点赞数缺失"); const noteContent = parseXiaohongshuNoteContent(androidUiNodes(detail).flatMap((node) => [node.text, node.desc]), cardData.resultAccessibilityLabel, cardData.author); if (!noteContent) throw new Error("未能从小红书详情页可靠分离标题和正文"); const coverEvidence = { bytes: await context.platform.driver.screenshot(), mimeType: "image/png" as const, capturedAt: new Date().toISOString(), source: "device_screenshot" as const }; const comments = parseComments(detail); if (comments === undefined) throw new Error("未采集到评论数"); const publication = await findPublishedAt(context.platform.driver, detail); if (!publication) throw new Error("未采集到发布时间"); const link = await copyOpenedNoteLink(context.platform.driver); const mediaType = xiaohongshuMediaTypeFromEvidence(cardData.resultAccessibilityLabel, link.mediaTypeHint); if (!mediaType) throw new Error("未采集到可验证的笔记类型证据"); const post: XiaohongshuDiscoveryPost = { externalId: link.externalId, canonicalUrl: link.canonicalUrl, author: cardData.author, title: noteContent.title, body: noteContent.body, likes: cardData.likes, comments, publishedAt: publication.publishedAt, mediaType, term: context.term!, rawPayload: { source: "xiaohongshu-android-share-link", term: context.term, candidate: context.candidateIndex + 1, resultAccessibilityLabel: cardData.resultAccessibilityLabel, titleBodyEvidence: { source: "detail_accessibility", values: noteContent.evidence, bodyLength: noteContent.body.length }, publicationEvidence: publication.evidence, publicationScrollAttempts: publication.scrollAttempts, mediaTypeEvidence: link.mediaTypeHint ? "share_link" : "result_accessibility_label", shareLinkResolved: true, shareUrl: link.shareUrl, resolvedShareUrl: link.resolvedUrl, fingerprint: xiaohongshuCardFingerprint(context.platform.currentCard!), coverEvidence: { source: coverEvidence.source, mimeType: coverEvidence.mimeType, capturedAt: coverEvidence.capturedAt } }, coverEvidence }; context.candidatePost = post; context.log("info", "candidate_read", `读取候选：${post.title}，正文 ${post.body.length} 字，点赞 ${post.likes}，评论 ${post.comments}，发布于 ${post.publishedAt}`, { externalId: post.externalId, checklistComplete: true }); context.log("info", "candidate_captured", "字段清单完整，已取得详情标题、正文、真实分享链接和详情首屏截图", { externalId: post.externalId, canonicalUrl: post.canonicalUrl, bodyLength: post.body.length, coverCapturedAt: coverEvidence.capturedAt }); }, recover: restoreXiaohongshuResults },
      { id: "xhs_candidate_return", state: "candidate_return", required: true, timeout: 100_000, attempts: 1, async execute(context) { await restoreXiaohongshuResults(context); }, recover: restoreXiaohongshuResults },
    ],
    termSwitch: [{ id: "xhs_term_switch", state: "term_switch", required: true, timeout: 25_000, attempts: 1, async execute(context) { if (!await waitForResults(context.platform.driver, context.term!, 5_000)) await restoreXiaohongshuResults(context); context.log("info", "term_switch_ready", "保留 App 会话，将清空搜索框后切换下一追踪词", { normalLaunches: context.platform.normalLaunches }); } }],
    complete: [{ id: "xhs_run_complete", state: "run_complete", required: false, timeout: 20_000, attempts: 1, async execute(context) { await context.platform.driver.releaseAppiumSession(); context.log("info", "run_completed", `小红书搜索完成：共取得 ${context.posts.length} 条真实分享链接`, { posts: context.posts.length, normalLaunches: context.platform.normalLaunches, recoveryLaunches: context.platform.recoveryLaunches }); } }],
  };
}

export async function discoverXiaohongshu(request: PlatformDiscoveryRequest): Promise<XiaohongshuDiscoveryResult> {
  const driver = await AndroidPhoneDriver.connect(XHS_PACKAGE, "小红书", request.deviceId);
  return runDiscoveryStateMachine({ request, platform: { driver, filtersVerified: false, normalLaunches: 0, recoveryLaunches: 0 }, plan: xhsPlan() });
}
