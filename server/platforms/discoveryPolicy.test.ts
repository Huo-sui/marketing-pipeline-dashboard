import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { discoveryPolicy, httpDiscoveryPayload, parseMediaTypeFilter, supportsMediaType } from "./discoveryPolicy.ts";

test("old TopicWatch rules default to any and illegal media types are rejected", () => {
  assert.equal(parseMediaTypeFilter(undefined), "any");
  assert.equal(parseMediaTypeFilter("video"), "video");
  assert.equal(parseMediaTypeFilter("text"), undefined);
});

test("adapter capabilities reject unsupported media policies without platform-name branching", () => {
  assert.equal(supportsMediaType(["any", "video"], "image_text"), false);
  assert.equal(supportsMediaType(["any", "video", "image_text"], "image_text"), true);
});

test("HTTP discovery payload forwards the new policy while remaining additive", () => {
  const payload = httpDiscoveryPayload("Example", { accountId: "account", deviceId: "device", traceId: "trace", terms: ["one"], policy: discoveryPolicy("video") });
  assert.deepEqual(payload.policy, { candidateLimitPerTerm: 3, mediaTypeFilter: "video" });
  assert.deepEqual(payload.terms, ["one"]);
});

test("Prisma schema and migration preserve existing rules with database default any", async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8"),
    readFile(new URL("../../prisma/migrations/0005_topic_media_type_filter/migration.sql", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /mediaTypeFilter\s+String\s+@default\("any"\)/);
  assert.match(migration, /"media_type_filter" TEXT NOT NULL DEFAULT 'any'/);
});
