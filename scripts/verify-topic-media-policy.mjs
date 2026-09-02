import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const baseUrl = (process.env.MARKETING_PIPELINE_TEST_BASE_URL ?? "http://127.0.0.1:3210/api/v1").replace(/\/$/, "");
const db = new PrismaClient();
let projectId;

async function api(path, init = {}, expected = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, `${init.method ?? "GET"} ${path}: ${JSON.stringify(payload)}`);
  return payload;
}

try {
  const project = await api("/projects", {
    method: "POST",
    body: JSON.stringify({ name: `Media policy integration ${Date.now()}`, type: "test", stage: "test", targetMarkets: [], languages: ["zh"], platforms: ["TikTok"], timezone: "UTC" }),
  }, 201);
  projectId = project.id;

  const topic = await api(`/projects/${projectId}/topic-watches`, {
    method: "POST",
    body: JSON.stringify({ name: "Policy contract", platform: "TikTok", terms: ["contract"], excludeTerms: [], cadence: "manual", state: "paused", minLikes: 0, minComments: 0, maxAgeHours: 24, minScore: 0 }),
  }, 201);
  assert.equal(topic.mediaTypeFilter, "any");

  const firstVersion = await db.topicWatchVersion.findFirstOrThrow({ where: { topicWatchId: topic.id, version: 1 } });
  assert.equal(firstVersion.config.mediaTypeFilter, "any");

  const patched = await api(`/topic-watches/${topic.id}`, { method: "PATCH", body: JSON.stringify({ mediaTypeFilter: "video" }) });
  assert.equal(patched.mediaTypeFilter, "video");
  const secondVersion = await db.topicWatchVersion.findFirstOrThrow({ where: { topicWatchId: topic.id, version: 2 } });
  assert.equal(secondVersion.config.mediaTypeFilter, "video");
  assert.equal(secondVersion.config.platform, "TikTok");

  await api(`/topic-watches/${topic.id}/versions`, { method: "POST", body: JSON.stringify({ config: { mediaTypeFilter: "image_text" } }) }, 400);
  const versioned = await api(`/topic-watches/${topic.id}/versions`, { method: "POST", body: JSON.stringify({ config: { mediaTypeFilter: "any" } }) }, 201);
  assert.equal(versioned.mediaTypeFilter, "any");
  const thirdVersion = await db.topicWatchVersion.findFirstOrThrow({ where: { topicWatchId: topic.id, version: 3 } });
  assert.equal(thirdVersion.config.mediaTypeFilter, "any");
  assert.equal(thirdVersion.config.platform, "TikTok");

  const runResult = await api(`/topic-watches/${topic.id}/runs`, { method: "POST", body: "{}" });
  assert.equal(runResult.ok, false);
  const collection = await db.collectionRun.findFirstOrThrow({ where: { topicWatchId: topic.id }, orderBy: { createdAt: "desc" } });
  assert.deepEqual(collection.inputSnapshot.policy, { candidateLimitPerTerm: 3, mediaTypeFilter: "any" });

  console.log(JSON.stringify({ ok: true, defaultMediaType: topic.mediaTypeFilter, patchedMediaType: patched.mediaTypeFilter, versionedMediaType: versioned.mediaTypeFilter, runPolicy: collection.inputSnapshot.policy }));
} finally {
  if (projectId) {
    const runs = await db.pipelineRun.findMany({ where: { projectId }, select: { id: true } });
    await db.$transaction([
      db.runEvent.deleteMany({ where: { runId: { in: runs.map((run) => run.id) } } }),
      db.collectionRun.deleteMany({ where: { projectId } }),
      db.pipelineRun.deleteMany({ where: { projectId } }),
      db.topicWatchVersion.deleteMany({ where: { projectId } }),
      db.topicWatch.deleteMany({ where: { projectId } }),
      db.projectConfigVersion.deleteMany({ where: { projectId } }),
      db.project.deleteMany({ where: { id: projectId } }),
    ]);
  }
  await db.$disconnect();
}
