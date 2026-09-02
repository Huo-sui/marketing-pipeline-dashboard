import assert from "node:assert/strict";
import test from "node:test";
import { runDiscoveryStateMachine, type DiscoveryPlanStep, type PlatformDiscoveryPlan } from "./discoveryStateMachine.ts";

type FakePlatform = { calls: string[]; failures: Map<string, number> };
type FakePost = { term: string; candidate: number };

function step(id: string, state: DiscoveryPlanStep<FakePost, FakePlatform>["state"], scope?: { optional?: boolean; recover?: boolean }): DiscoveryPlanStep<FakePost, FakePlatform> {
  return {
    id, state, required: !scope?.optional, timeout: 500, attempts: scope?.recover ? 2 : 1,
    async execute(context) {
      context.platform.calls.push(`${context.term ?? "run"}:${id}:${context.candidateIndex}`);
      const remaining = context.platform.failures.get(id) ?? 0;
      if (remaining > 0) { context.platform.failures.set(id, remaining - 1); throw new Error(`${id} failed`); }
      if (id === "extract") context.candidatePost = { term: context.term!, candidate: context.candidateIndex };
    },
    verify: () => true,
    recover: scope?.recover ? async (context) => { context.platform.calls.push(`${context.term}:recover:${id}`); } : undefined,
  };
}

function plan(candidateSteps = [step("scan", "candidate_scan"), step("extract", "candidate_extract")]): PlatformDiscoveryPlan<FakePost, FakePlatform> {
  return {
    version: "fake-v1",
    session: [step("ready", "session_ready")],
    term: [step("prepare", "term_prepare"), step("submit", "query_submitted"), step("results", "results_ready"), step("filter", "filters_apply")],
    candidate: candidateSteps,
    termSwitch: [step("switch", "term_switch")],
    complete: [step("complete", "run_complete")],
  };
}

const request = { accountId: "fake", deviceId: "device", traceId: "trace", terms: ["alpha", "beta"], policy: { candidateLimitPerTerm: 3 as const, mediaTypeFilter: "any" as const } };

test("Fake Plan supports inserted/deleted steps, stable state order, term switching without restart, and a hard three-candidate cap", async () => {
  const platform: FakePlatform = { calls: [], failures: new Map() };
  const custom = plan([step("scan", "candidate_scan"), step("inserted", "candidate_open", { optional: true }), step("extract", "candidate_extract")]);
  const result = await runDiscoveryStateMachine({ request, platform, plan: custom });
  assert.equal(result.posts.length, 6);
  assert.equal(platform.calls.filter((value) => value.includes(":ready:")).length, 1);
  assert.equal(platform.calls.filter((value) => value.includes(":switch:")).length, 1);
  assert.equal(platform.calls.filter((value) => value.includes(":scan:")).length, 6);
  assert.deepEqual(result.logs.filter((log) => log.eventType === "discovery_state").slice(0, 5).map((log) => log.payload?.state), ["session_ready", "term_prepare", "query_submitted", "results_ready", "filters_apply"]);
});

test("Fake Plan retries with recovery and continues after a candidate failure", async () => {
  const platform: FakePlatform = { calls: [], failures: new Map([["recoverable", 1], ["broken", 99]]) };
  const result = await runDiscoveryStateMachine({ request: { ...request, terms: ["alpha"] }, platform, plan: plan([step("recoverable", "candidate_scan", { recover: true }), step("broken", "candidate_open", { optional: true }), step("extract", "candidate_extract")]) });
  assert.equal(result.posts.length, 3);
  assert.ok(platform.calls.includes("alpha:recover:recoverable"));
  assert.equal(result.logs.filter((log) => log.eventType === "step_failed").length, 4);
});

test("Fake Plan ends a term when a required filter cannot be verified", async () => {
  const platform: FakePlatform = { calls: [], failures: new Map([["filter", 99]]) };
  const result = await runDiscoveryStateMachine({ request: { ...request, terms: ["alpha"] }, platform, plan: plan() });
  assert.equal(result.posts.length, 0);
  assert.equal(result.logs.some((log) => log.eventType === "search_failed"), true);
});

test("a field-complete candidate is retained when returning to results fails", async () => {
  const platform: FakePlatform = { calls: [], failures: new Map([["return", 99]]) };
  const result = await runDiscoveryStateMachine({ request: { ...request, terms: ["alpha"] }, platform, plan: plan([step("extract", "candidate_extract"), step("return", "candidate_return")]) });
  assert.equal(result.posts.length, 1);
  assert.equal(result.logs.filter((log) => log.eventType === "candidate_return_failed").length, 1);
  assert.equal(result.logs.filter((log) => log.eventType === "term_stopped_after_return_failure").length, 1);
});

test("a timed-out execute settles before recovery and retry, preventing overlapping phone operations", async () => {
  let execution = 0;
  const timedStep: DiscoveryPlanStep<FakePost, FakePlatform> = {
    id: "slow", state: "session_ready", required: true, timeout: 5, attempts: 2,
    async execute(context) {
      execution += 1;
      context.platform.calls.push(`execute-${execution}`);
      if (execution === 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        context.platform.calls.push("late-execute-settled");
      }
    },
    async recover(context) { context.platform.calls.push("recover"); },
  };
  const platform: FakePlatform = { calls: [], failures: new Map() };
  const custom = plan();
  custom.session = [timedStep];
  await runDiscoveryStateMachine({ request: { ...request, terms: [] }, platform, plan: custom });
  assert.deepEqual(platform.calls.slice(0, 4), ["execute-1", "late-execute-settled", "recover", "execute-2"]);
});
