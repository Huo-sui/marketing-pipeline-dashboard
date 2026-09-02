import assert from "node:assert/strict";
import test from "node:test";
import { allIdeaSourcesCurrentlyAdmitted } from "./ideaSourceEligibility.ts";

const capturedAt = new Date("2026-09-02T12:00:00.000Z");
const publishedAt = new Date("2026-09-02T10:00:00.000Z");
const topic = { id: "topic-1", minLikes: 4_000, minComments: 100, minScore: 50, maxAgeHours: 168 };

test("来源帖无需人工审批，只要继续通过 TopicWatch 硬门槛即可生成选题", () => {
  const sources = [
    { id: "pending-source", publishedAt, reviewState: "pending" },
    { id: "rejected-source", publishedAt, reviewState: "rejected" },
  ];
  const metrics = sources.map((source) => ({ sourcePostId: source.id, likes: 8_000, comments: 400, capturedAt }));
  const matches = sources.map((source) => ({ sourcePostId: source.id, topicWatchId: topic.id }));

  assert.equal(allIdeaSourcesCurrentlyAdmitted(sources, metrics, matches, [topic]), true);
});

test("来源帖低于任一硬门槛时不能生成选题", () => {
  const sources = [{ id: "low-comments", publishedAt, reviewState: "approved" }];
  const metrics = [{ sourcePostId: "low-comments", likes: 8_000, comments: 99, capturedAt }];
  const matches = [{ sourcePostId: "low-comments", topicWatchId: topic.id }];

  assert.equal(allIdeaSourcesCurrentlyAdmitted(sources, metrics, matches, [topic]), false);
});

test("缺少指标、发布时间、有效匹配或当前规则时一律 fail closed", () => {
  const source = { id: "source-1", publishedAt };
  const metric = { sourcePostId: source.id, likes: 8_000, comments: 400, capturedAt };
  const match = { sourcePostId: source.id, topicWatchId: topic.id };

  assert.equal(allIdeaSourcesCurrentlyAdmitted([source], [], [match], [topic]), false);
  assert.equal(allIdeaSourcesCurrentlyAdmitted([{ ...source, publishedAt: null }], [metric], [match], [topic]), false);
  assert.equal(allIdeaSourcesCurrentlyAdmitted([source], [metric], [], [topic]), false);
  assert.equal(allIdeaSourcesCurrentlyAdmitted([source], [metric], [match], []), false);
});

test("同一来源匹配多条当前规则时，至少一条完整通过即可生成选题", () => {
  const source = { id: "multi-match", publishedAt };
  const metric = { sourcePostId: source.id, likes: 8_000, comments: 400, capturedAt };
  const impossibleTopic = { ...topic, id: "impossible-topic", minLikes: 100_000 };
  const matches = [
    { sourcePostId: source.id, topicWatchId: impossibleTopic.id },
    { sourcePostId: source.id, topicWatchId: topic.id },
  ];

  assert.equal(allIdeaSourcesCurrentlyAdmitted([source], [metric], matches, [impossibleTopic, topic]), true);
});
