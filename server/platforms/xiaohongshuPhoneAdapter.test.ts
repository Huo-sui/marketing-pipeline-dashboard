import assert from "node:assert/strict";
import test from "node:test";
import { parseXiaohongshuPublicationValues } from "./xiaohongshuMetadata.ts";
import { isAllowedXiaohongshuUrl, xiaohongshuExternalId, xiaohongshuMediaTypeHint } from "./xiaohongshuUrl.ts";

const now = new Date("2026-08-28T16:00:00.000Z");

test("parses Xiaohongshu standalone publication dates", () => {
  assert.equal(parseXiaohongshuPublicationValues(["编辑于 06-14 多伦多"], now)?.publishedAt, "2026-06-14T00:00:00.000Z");
  assert.equal(parseXiaohongshuPublicationValues(["2025-12-03 北京"], now)?.publishedAt, "2025-12-03T00:00:00.000Z");
  assert.equal(parseXiaohongshuPublicationValues(["昨天 14:42"], now)?.publishedAt, "2026-08-27T16:00:00.000Z");
});

test("does not mistake a date inside the note body for publication metadata", () => {
  assert.equal(parseXiaohongshuPublicationValues(["我在 2025-12-03 开始读这本书，后来又读了很多英文原著。"], now), undefined);
});

test("accepts only allowlisted Xiaohongshu hosts and preserves video evidence", () => {
  const videoUrl = "https://www.xiaohongshu.com/explore/64f1234567890abc?type=video&xsec_token=redacted";
  assert.equal(isAllowedXiaohongshuUrl(videoUrl), true);
  assert.equal(isAllowedXiaohongshuUrl("https://xiaohongshu.com.attacker.example/explore/64f1234567890abc"), false);
  assert.equal(xiaohongshuExternalId(videoUrl), "64f1234567890abc");
  assert.equal(xiaohongshuMediaTypeHint(videoUrl), "视频");
});
