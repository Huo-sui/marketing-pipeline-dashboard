import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLoopbackPublisherBaseUrl, parseXiaohongshuPublisherResult, xiaohongshuHttpPublisher } from "./xiaohongshuPublisher.ts";

test("accepts only loopback Xiaohongshu Publisher endpoints", () => {
  assert.equal(normalizeLoopbackPublisherBaseUrl("http://127.0.0.1:4900/"), "http://127.0.0.1:4900");
  assert.equal(normalizeLoopbackPublisherBaseUrl("http://localhost:4900/api/"), "http://localhost:4900/api");
  assert.throws(() => normalizeLoopbackPublisherBaseUrl("https://publisher.example.com"), /回环地址/);
  assert.throws(() => normalizeLoopbackPublisherBaseUrl("http://localhost.example.com:4900"), /回环地址/);
  const credentialUrl = new URL("http://127.0.0.1:4900");
  credentialUrl.username = "user";
  credentialUrl.password = "password";
  assert.throws(() => normalizeLoopbackPublisherBaseUrl(credentialUrl.toString()), /内嵌凭据/);
});

test("accepts a real normalized Xiaohongshu publication receipt", () => {
  const platformPostId = "0123456789abcdef";
  const result = parseXiaohongshuPublisherResult({
    status: "succeeded",
    platformPostId,
    canonicalUrl: `https://www.xiaohongshu.com/explore/${platformPostId}`,
    publishedAt: "2026-08-29T12:00:00+08:00",
    externalRequestId: "request-1",
  });
  assert.equal(result.status, "succeeded");
  if (result.status === "succeeded") {
    assert.equal(result.platformPostId, platformPostId);
    assert.equal(result.publishedAt, "2026-08-29T04:00:00.000Z");
  }
});

test("rejects a fabricated or mismatched Xiaohongshu publication receipt", () => {
  assert.throws(() => parseXiaohongshuPublisherResult({ status: "succeeded", platformPostId: "0123456789abcdef", canonicalUrl: "https://example.com/post/0123456789abcdef", publishedAt: "2026-08-29T12:00:00Z" }), /canonicalUrl/);
  assert.throws(() => parseXiaohongshuPublisherResult({ status: "succeeded", platformPostId: "fedcba9876543210", canonicalUrl: "https://www.xiaohongshu.com/explore/0123456789abcdef", publishedAt: "2026-08-29T12:00:00Z" }), /canonicalUrl/);
  assert.throws(() => parseXiaohongshuPublisherResult({ status: "succeeded", platformPostId: "0123456789abcdef", canonicalUrl: "https://www.xiaohongshu.com/explore/0123456789abcdef", publishedAt: "now" }), /publishedAt/);
});

test("sends the locked draft contract to the configured local Publisher", async () => {
  const previousFetch = globalThis.fetch;
  const previousBaseUrl = process.env.XIAOHONGSHU_PUBLISHER_BASE_URL;
  process.env.XIAOHONGSHU_PUBLISHER_BASE_URL = "http://127.0.0.1:4900";
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "http://127.0.0.1:4900/publish");
      assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "stable-key");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.contractVersion, 1);
      const artifacts = body.artifacts as Array<Record<string, unknown>>;
      assert.equal(artifacts[0].contentUrl, "http://127.0.0.1:3210/api/v1/artifacts/artifact-1/content");
      assert.equal("storageKey" in artifacts[0], false);
      return new Response(JSON.stringify({ status: "succeeded", platformPostId: "0123456789abcdef", canonicalUrl: "https://www.xiaohongshu.com/explore/0123456789abcdef?tracking=removed", publishedAt: "2026-08-29T12:00:00+08:00" }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const result = await xiaohongshuHttpPublisher.publish({
      publicationDraftId: "draft-1",
      idempotencyKey: "stable-key",
      platform: "小红书",
      title: "标题",
      copy: "正文",
      account: { id: "account-1", handle: "@account" },
      runner: { id: "runner-1", runnerType: "phone", deviceId: "<device>", appPackage: "com.xingin.xhs" },
      artifacts: [{ id: "artifact-1", storageProvider: "local", storageKey: "artifacts/artifact-1.bin", mimeType: "image/png", sha256: "digest", contentUrl: "http://127.0.0.1:3210/api/v1/artifacts/artifact-1/content" }],
    });
    assert.equal(result.status, "succeeded");
    if (result.status === "succeeded") assert.equal(result.canonicalUrl, "https://www.xiaohongshu.com/explore/0123456789abcdef");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBaseUrl === undefined) delete process.env.XIAOHONGSHU_PUBLISHER_BASE_URL;
    else process.env.XIAOHONGSHU_PUBLISHER_BASE_URL = previousBaseUrl;
  }
});
