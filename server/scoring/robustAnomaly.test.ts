import assert from "node:assert/strict";
import test from "node:test";
import { engagementAgeBucket, scorePositiveEngagementOutlier } from "./robustAnomaly.ts";

const cohort = Array.from({ length: 40 }, (_, index) => ({ likes: 900 + index * 10, comments: 30 + index % 5, ageHours: 24 }));

test("does not invent an anomaly when the baseline is too small", () => {
  const result = scorePositiveEngagementOutlier({ likes: 100_000, comments: 5_000, ageHours: 2 }, cohort.slice(0, 10), { minSamples: 30, zThreshold: 3.5 });
  assert.equal(result.state, "insufficient_baseline");
});

test("detects a strong positive engagement velocity outlier", () => {
  const result = scorePositiveEngagementOutlier({ likes: 100_000, comments: 5_000, ageHours: 2 }, cohort, { minSamples: 30, zThreshold: 3.5 });
  assert.equal(result.state, "positive_outlier");
});

test("keeps a cohort-level post in the normal band", () => {
  const result = scorePositiveEngagementOutlier({ likes: 1_050, comments: 32, ageHours: 24 }, cohort, { minSamples: 30, zThreshold: 3.5 });
  assert.equal(result.state, "normal");
});

test("detects an unusually strong comment rate", () => {
  const result = scorePositiveEngagementOutlier({ likes: 1_000, comments: 600, ageHours: 24 }, cohort, { minSamples: 30, zThreshold: 3.5 });
  assert.equal(result.state, "positive_outlier");
  assert.ok(result.state === "positive_outlier" && result.commentRateScore > result.likeScore);
});

test("uses stable publication age buckets", () => {
  assert.equal(engagementAgeBucket(12), "0-24h");
  assert.equal(engagementAgeBucket(48), "24-72h");
  assert.equal(engagementAgeBucket(120), "3-7d");
  assert.equal(engagementAgeBucket(400), "7-30d");
  assert.equal(engagementAgeBucket(900), "30d+");
});
