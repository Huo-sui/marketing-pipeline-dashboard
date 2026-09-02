import assert from "node:assert/strict";
import test from "node:test";
import { TIKTOK_DISCOVERY_POLICY, tiktokExternalIdFromUrl, tiktokMediaTypeFromUrl, tiktokSearchCandidates } from "./tiktokDiscoveryPolicy.ts";

test("TikTok unified plan keeps recent-upload optional and caps each term at three", () => {
  assert.equal(TIKTOK_DISCOVERY_POLICY.recentUpload.stepId, "tiktok_recent_upload");
  assert.equal(TIKTOK_DISCOVERY_POLICY.recentUpload.required, false);
  assert.equal(TIKTOK_DISCOVERY_POLICY.candidateLimitPerTerm, 3);
});

test("TikTok candidates are enumerated left-to-right and top-to-bottom with stable fingerprints", () => {
  const xml = `<hierarchy>
    <node resource-id="com.zhiliaoapp.musically:id/v68" content-desc="right video" clickable="true" bounds="[500,200][900,600]" />
    <node resource-id="com.zhiliaoapp.musically:id/v68" content-desc="lower video" clickable="true" bounds="[20,700][420,1100]" />
    <node resource-id="com.zhiliaoapp.musically:id/v68" content-desc="left video" clickable="true" bounds="[20,210][420,610]" />
  </hierarchy>`;
  assert.deepEqual(tiktokSearchCandidates(xml).map((card) => card.fingerprint), ["left video", "right video", "lower video"]);
});

test("TikTok source identity requires a real post id and never promotes a short-link code", () => {
  assert.equal(tiktokExternalIdFromUrl("https://www.tiktok.com/@author/video/7512345678901234567"), "7512345678901234567");
  assert.equal(tiktokExternalIdFromUrl("https://www.tiktok.com/@author/photo/7572463300143844630"), "7572463300143844630");
  assert.equal(tiktokMediaTypeFromUrl("https://www.tiktok.com/@author/photo/7572463300143844630"), "图文");
  assert.equal(tiktokExternalIdFromUrl("https://vt.tiktok.com/ZSExample/"), "");
});
