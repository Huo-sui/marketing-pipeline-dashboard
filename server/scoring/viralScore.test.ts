import assert from "node:assert/strict";
import test from "node:test";
import { scoreViralPost } from "./viralScore.ts";

const calibration = { minLikes: 100, minComments: 0, maxAgeHours: 8760 };
const capturedAt = "2026-08-31T12:00:00.000Z";

function score(likes: number, comments: number, ageHours: number) {
  return scoreViralPost({ likes, comments, capturedAt, publishedAt: new Date(new Date(capturedAt).getTime() - ageHours * 3_600_000) }, calibration);
}

test("fresh engagement receives a higher score than the same totals accumulated slowly", () => {
  assert.ok(score(1_000, 100, 24).total > score(1_000, 100, 24 * 30).total);
});

test("strong comments can compensate for a lower like count", () => {
  assert.ok(score(500, 200, 12).total > score(5_000, 5, 24).total);
});

test("a zero configured comment threshold does not award free points", () => {
  const noComments = score(1_000, 0, 24);
  const withComments = score(1_000, 100, 24);
  assert.equal(noComments.components.commentStrength, 0);
  assert.ok(withComments.total > noComments.total);
});

test("the score records raw velocities and a bounded total", () => {
  const result = score(1_000, 100, 24);
  assert.equal(result.likesPerHour, 41.67);
  assert.equal(result.commentsPerHour, 4.17);
  assert.equal(result.commentRate, 0.1);
  assert.ok(result.total >= 0 && result.total <= 100);
});

test("future publication evidence is rejected", () => {
  assert.throws(() => scoreViralPost({ likes: 100, comments: 10, capturedAt, publishedAt: "2026-09-01T12:00:00.000Z" }, calibration), /晚于采集时间/);
});
