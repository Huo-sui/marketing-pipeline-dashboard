import assert from "node:assert/strict";
import test from "node:test";
import { evaluateViralAdmission, viralAdmissionPassedMessage, viralAdmissionReasons } from "./viralAdmission.ts";

const thresholds = { minLikes: 2_000, minComments: 100, minScore: 70 };

test("likes, comments, and score are independent hard admission gates", () => {
  assert.deepEqual(viralAdmissionReasons({ likes: 1_999, comments: 100, score: 70 }, thresholds), ["点赞 1999 < 硬门槛 2000"]);
  assert.deepEqual(viralAdmissionReasons({ likes: 2_000, comments: 99, score: 70 }, thresholds), ["评论 99 < 硬门槛 100"]);
  assert.deepEqual(viralAdmissionReasons({ likes: 2_000, comments: 100, score: 69.9 }, thresholds), ["三角评分 69.9 < 硬门槛 70"]);
});

test("a candidate passes only when all three hard gates pass", () => {
  const input = { likes: 2_000, comments: 100, score: 70 };
  assert.deepEqual(viralAdmissionReasons(input, thresholds), []);
  assert.match(viralAdmissionPassedMessage(input, thresholds), /点赞 2000 ≥ 2000.*评论 100 ≥ 100.*三角评分 70\.0 ≥ 70/);
});

test("current evidence is re-evaluated against current TopicWatch thresholds", () => {
  const evidence = { likes: 1_999, comments: 100, publishedAt: new Date("2026-09-01T00:00:00Z"), capturedAt: new Date("2026-09-02T00:00:00Z") };
  const result = evaluateViralAdmission(evidence, { ...thresholds, maxAgeHours: 72 });
  assert.equal(result.passed, false);
  assert.match(result.reasons.join("；"), /点赞 1999 < 硬门槛 2000/);
});
