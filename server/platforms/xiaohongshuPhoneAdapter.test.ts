import assert from "node:assert/strict";
import test from "node:test";
import { parseXiaohongshuNoteContent, parseXiaohongshuPublicationValues } from "./xiaohongshuMetadata.ts";
import { isAllowedXiaohongshuUrl, isUsableXiaohongshuAccessUrl, xiaohongshuExternalId, xiaohongshuMediaTypeHint, xiaohongshuShareAccessUrl } from "./xiaohongshuUrl.ts";
import { findXiaohongshuFilterOption, sortXiaohongshuCardsVisualOrder, xiaohongshuCardFingerprint, xiaohongshuDetailMatchesPost, xiaohongshuFilterLabels, xiaohongshuMediaTypeFromEvidence } from "./xiaohongshuDiscoveryPolicy.ts";

const now = new Date("2026-08-28T16:00:00.000Z");

test("详情首屏截图只接受目标标题与作者同时匹配的页面", () => {
  const post = { title: "这 5 个阅读方法让我一年读完 100 本书", author: "相见恨晚" };
  assert.equal(xiaohongshuDetailMatchesPost(["相见恨晚", "这 5 个阅读方法让我一年读完 100 本书", "分享 评论 收藏"], post), true);
  assert.equal(xiaohongshuDetailMatchesPost(["其他作者", "这 5 个阅读方法让我一年读完 100 本书", "分享 评论 收藏"], post), false);
  assert.equal(xiaohongshuDetailMatchesPost(["相见恨晚", "另一篇帖子", "分享 评论 收藏"], post), false);
});

test("parses Xiaohongshu standalone publication dates", () => {
  assert.equal(parseXiaohongshuPublicationValues(["编辑于 06-14 多伦多"], now)?.publishedAt, "2026-06-14T00:00:00.000Z");
  assert.equal(parseXiaohongshuPublicationValues(["2025-12-03 北京"], now)?.publishedAt, "2025-12-03T00:00:00.000Z");
  assert.equal(parseXiaohongshuPublicationValues(["昨天 14:42"], now)?.publishedAt, "2026-08-27T16:00:00.000Z");
});

test("does not mistake a date inside the note body for publication metadata", () => {
  assert.equal(parseXiaohongshuPublicationValues(["我在 2025-12-03 开始读这本书，后来又读了很多英文原著。"], now), undefined);
  assert.equal(parseXiaohongshuPublicationValues(["1/5"], now), undefined);
  assert.equal(parseXiaohongshuPublicationValues(["发布于 8/27"], now)?.publishedAt, "2026-08-27T00:00:00.000Z");
});

test("separates Xiaohongshu detail title and body instead of promoting the card snippet", () => {
  const title = "想知道如何才能流畅阅读英文原著";
  const body = "起因是很喜欢某位英文作家，加上译本不尽人意，所以想试着去读原著。";
  const label = `笔记 ${title} ${body} 来自 野今村サノ 7770赞`;
  assert.deepEqual(parseXiaohongshuNoteContent(["野今村サノ", title, body, "发布于 06-14", "306条评论"], label, "野今村サノ"), {
    title,
    body,
    evidence: [title, body],
  });
});

test("rejects a combined result-card snippet when detail body evidence is absent", () => {
  const combined = "标题和正文被错误拼在一起";
  assert.equal(parseXiaohongshuNoteContent([combined, "作者"], `笔记 ${combined} 来自 作者 5000赞`, "作者"), undefined);
});

test("accepts only allowlisted Xiaohongshu hosts and preserves video evidence", () => {
  const videoUrl = "https://www.xiaohongshu.com/explore/64f1234567890abc?type=video&xsec_token=redacted";
  assert.equal(isAllowedXiaohongshuUrl(videoUrl), true);
  assert.equal(isAllowedXiaohongshuUrl("https://xiaohongshu.com.attacker.example/explore/64f1234567890abc"), false);
  assert.equal(xiaohongshuExternalId(videoUrl), "64f1234567890abc");
  assert.equal(xiaohongshuMediaTypeHint(videoUrl), "视频");
  assert.equal(xiaohongshuMediaTypeHint("https://www.xiaohongshu.com/explore/64f1234567890abc?type=normal"), "图文");
});

test("keeps a browser-openable Xiaohongshu share URL and rejects bare tokenless explore links", () => {
  const bare = "https://www.xiaohongshu.com/explore/64f1234567890abc";
  const resolved = `${bare}?xsec_token=real-share-token&type=normal`;
  assert.equal(xiaohongshuShareAccessUrl("https://xhslink.com/a1b2", resolved)?.canonicalUrl, resolved);
  assert.equal(xiaohongshuShareAccessUrl("https://xhslink.com/a1b2", bare)?.canonicalUrl, "https://xhslink.com/a1b2");
  assert.equal(xiaohongshuShareAccessUrl(bare, bare), undefined);
  assert.equal(isUsableXiaohongshuAccessUrl(resolved), true);
  assert.equal(isUsableXiaohongshuAccessUrl("https://xhslink.com/a1b2"), true);
  assert.equal(isUsableXiaohongshuAccessUrl(bare), false);
});

test("maps media policy to the four required Xiaohongshu filters", () => {
  assert.deepEqual(xiaohongshuFilterLabels("any"), { sort: "最多点赞", age: "一周内", seen: "未看过", media: "不限" });
  assert.equal(xiaohongshuFilterLabels("video").media, "视频");
  assert.equal(xiaohongshuFilterLabels("image_text").media, "图文");
});

test("sorts Xiaohongshu cards by visual rows instead of parsed likes", () => {
  const cards = [
    { text: "右上高赞", desc: "", className: "android.widget.TextView", bounds: { left: 520, top: 300, right: 900, bottom: 500 } },
    { text: "左下最高赞", desc: "", className: "android.widget.TextView", bounds: { left: 40, top: 620, right: 420, bottom: 820 } },
    { text: "左上低赞", desc: "", className: "android.widget.TextView", bounds: { left: 40, top: 315, right: 420, bottom: 515 } },
  ];
  assert.deepEqual(sortXiaohongshuCardsVisualOrder(cards).map((card) => card.text), ["左上低赞", "右上高赞", "左下最高赞"]);
});

test("fingerprint follows accessible card content even when unseen filtering moves its slot", () => {
  const first = { text: "标题", desc: "笔记 标题 来自作者 10赞", className: "android.widget.TextView", bounds: { left: 20, top: 300, right: 400, bottom: 500 } };
  assert.equal(xiaohongshuCardFingerprint(first), xiaohongshuCardFingerprint({ ...first }));
  assert.equal(xiaohongshuCardFingerprint(first), xiaohongshuCardFingerprint({ ...first, bounds: { ...first.bounds, top: 600 } }));
  assert.notEqual(xiaohongshuCardFingerprint(first), xiaohongshuCardFingerprint({ ...first, desc: "笔记 另一个标题 来自作者 10赞" }));
});

test("the any media option is resolved inside the note-type group when labels repeat", () => {
  const node = (text: string, top: number) => ({ text, desc: "", bounds: { left: 10, top, right: 110, bottom: top + 30 } });
  const nodes = [node("笔记类型", 100), node("不限", 140), node("视频", 140), node("发布时间", 220), node("一周内", 260), node("浏览范围", 340), node("未看过", 380), node("位置", 460), node("不限", 500)];
  assert.equal(findXiaohongshuFilterOption(nodes, "不限", "media")?.bounds?.top, 140);
});

test("media type requires share-link or accessibility evidence instead of a default", () => {
  assert.equal(xiaohongshuMediaTypeFromEvidence("视频 一分钟讲完一本书"), "视频");
  assert.equal(xiaohongshuMediaTypeFromEvidence("笔记 英语原著阅读清单"), "图文");
  assert.equal(xiaohongshuMediaTypeFromEvidence("英语原著阅读清单"), undefined);
  assert.equal(xiaohongshuMediaTypeFromEvidence("未知", "图文"), "图文");
});
