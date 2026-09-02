import assert from "node:assert/strict";
import test from "node:test";
import { runDiscoveryWithFallback } from "./discoveryFallback.ts";

test("合格的主抓取结果不会触发回退", async () => {
  let fallbackCalls = 0;
  const outcome = await runDiscoveryWithFallback({
    primary: async () => [5],
    qualify: (values) => values.filter((value) => value >= 3),
    acceptedCount: (values) => values.length,
    fallback: async () => { fallbackCalls += 1; return [9]; },
  });
  assert.equal(outcome.usedFallback, false);
  assert.deepEqual(outcome.result, [5]);
  assert.equal(fallbackCalls, 0);
});

test("主抓取异常会触发回退", async () => {
  const outcome = await runDiscoveryWithFallback({
    primary: async (): Promise<number[]> => { throw new Error("MCP timeout"); },
    qualify: (values) => values,
    acceptedCount: (values) => values.length,
    fallback: async (reason) => { assert.equal(reason.kind, "primary_error"); return [8]; },
  });
  assert.equal(outcome.usedFallback, true);
  assert.deepEqual(outcome.result, [8]);
});

test("主抓取没有通过硬门槛的帖子时回退", async () => {
  const outcome = await runDiscoveryWithFallback({
    primary: async () => [1, 2],
    qualify: (values) => values.filter((value) => value >= 3),
    acceptedCount: (values) => values.length,
    fallback: async (reason) => { assert.equal(reason.kind, "no_qualified_posts"); return [4]; },
  });
  assert.equal(outcome.usedFallback, true);
  assert.deepEqual(outcome.primaryQualification, []);
  assert.deepEqual(outcome.qualification, [4]);
});

test("回退正常完成但仍无合格帖子时返回空成功结果", async () => {
  const outcome = await runDiscoveryWithFallback({
    primary: async () => [],
    qualify: (values: number[]) => values,
    acceptedCount: (values) => values.length,
    fallback: async () => [],
  });
  assert.equal(outcome.usedFallback, true);
  assert.deepEqual(outcome.qualification, []);
});

test("多追踪词只对缺少合格结果的词执行回退并合并结果", async () => {
  type Item = { term: string; accepted: boolean };
  let fallbackTerms: string[] | undefined;
  const qualify = (items: Item[]) => items.filter((item) => item.accepted);
  const outcome = await runDiscoveryWithFallback({
    primary: async () => [{ term: "词A", accepted: true }, { term: "词B", accepted: false }],
    qualify,
    acceptedCount: (items) => items.length,
    missingPartitions: (items) => ["词A", "词B"].filter((term) => !items.some((item) => item.term === term)),
    mergeResults: (primary, fallback) => [...primary, ...fallback],
    fallback: async (reason) => { fallbackTerms = reason.terms; return [{ term: "词B", accepted: true }]; },
  });
  assert.deepEqual(fallbackTerms, ["词B"]);
  assert.deepEqual(outcome.qualification.map((item) => item.term), ["词A", "词B"]);
});

test("缺口词回退失败时保留其他词已经合格的主抓取结果", async () => {
  type Item = { term: string; accepted: boolean };
  const qualify = (items: Item[]) => items.filter((item) => item.accepted);
  const outcome = await runDiscoveryWithFallback({
    primary: async () => [{ term: "词A", accepted: true }, { term: "词B", accepted: false }],
    qualify,
    acceptedCount: (items) => items.length,
    missingPartitions: (items) => ["词A", "词B"].filter((term) => !items.some((item) => item.term === term)),
    mergeResults: (primary, fallback) => [...primary, ...fallback],
    fallback: async () => { throw new Error("词B 手机搜索失败"); },
  });
  assert.equal(outcome.usedFallback, true);
  assert.equal(outcome.fallbackError, "词B 手机搜索失败");
  assert.deepEqual(outcome.qualification, [{ term: "词A", accepted: true }]);
});
