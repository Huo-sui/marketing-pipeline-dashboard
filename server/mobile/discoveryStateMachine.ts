export type DiscoveryMediaTypeFilter = "any" | "video" | "image_text";

export type PlatformDiscoveryRequest = {
  accountId: string;
  deviceId?: string;
  traceId: string;
  terms: string[];
  policy: {
    candidateLimitPerTerm: 3;
    mediaTypeFilter: DiscoveryMediaTypeFilter;
  };
};

export type DiscoveryState =
  | "session_ready"
  | "term_prepare"
  | "query_submitted"
  | "results_ready"
  | "filters_apply"
  | "filters_verify"
  | "candidate_scan"
  | "candidate_open"
  | "candidate_extract"
  | "candidate_return"
  | "term_switch"
  | "run_complete";

export type DiscoveryMachineLog = {
  timestamp: string;
  level: "info" | "warn" | "error";
  eventType: string;
  message: string;
  term?: string;
  page?: number;
  payload?: Record<string, unknown>;
};

export type DiscoveryMachineContext<TPost, TPlatform> = {
  request: PlatformDiscoveryRequest;
  platform: TPlatform;
  term?: string;
  termIndex: number;
  candidateIndex: number;
  candidatePost?: TPost;
  posts: TPost[];
  logs: DiscoveryMachineLog[];
  visitedFingerprints: Set<string>;
  state: DiscoveryState;
  log: (level: DiscoveryMachineLog["level"], eventType: string, message: string, payload?: Record<string, unknown>) => void;
};

export type DiscoveryPlanStep<TPost, TPlatform> = {
  id: string;
  state: DiscoveryState;
  required: boolean;
  timeout: number;
  attempts: number;
  execute: (context: DiscoveryMachineContext<TPost, TPlatform>) => Promise<void>;
  verify?: (context: DiscoveryMachineContext<TPost, TPlatform>) => boolean | Promise<boolean>;
  recover?: (context: DiscoveryMachineContext<TPost, TPlatform>, error: unknown, attempt: number) => void | Promise<void>;
};

export type PlatformDiscoveryPlan<TPost, TPlatform> = {
  version: string;
  session: DiscoveryPlanStep<TPost, TPlatform>[];
  term: DiscoveryPlanStep<TPost, TPlatform>[];
  candidate: DiscoveryPlanStep<TPost, TPlatform>[];
  termSwitch: DiscoveryPlanStep<TPost, TPlatform>[];
  complete: DiscoveryPlanStep<TPost, TPlatform>[];
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知状态机错误";
}

async function withTimeout<T>(operation: Promise<T>, timeout: number, stepId: string): Promise<T> {
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; }, timeout);
  try {
    const result = await operation;
    if (timedOut) throw new Error(`步骤 ${stepId} 在 ${timeout}ms 内未完成`);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function runStep<TPost, TPlatform>(context: DiscoveryMachineContext<TPost, TPlatform>, step: DiscoveryPlanStep<TPost, TPlatform>) {
  context.state = step.state;
  let lastError: unknown;
  const attempts = Math.max(1, step.attempts);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    context.log("info", "discovery_state", `${step.state} · ${step.id}`, { state: step.state, stepId: step.id, attempt, attempts });
    try {
      await withTimeout(step.execute(context), step.timeout, step.id);
      if (step.verify && !await withTimeout(Promise.resolve(step.verify(context)), step.timeout, `${step.id}.verify`)) {
        throw new Error(`步骤 ${step.id} 验证失败`);
      }
      return true;
    } catch (error) {
      lastError = error;
      context.log(attempt < attempts ? "warn" : step.required ? "error" : "warn", "step_failed", `${step.id} 第 ${attempt}/${attempts} 次执行失败：${errorMessage(error)}`, { state: step.state, stepId: step.id, attempt, required: step.required });
      if (step.recover) {
        try { await step.recover(context, error, attempt); }
        catch (recoveryError) {
          lastError = recoveryError;
          context.log(attempt < attempts ? "warn" : step.required ? "error" : "warn", "step_recovery_failed", `${step.id} 恢复失败：${errorMessage(recoveryError)}`, { state: step.state, stepId: step.id, attempt });
        }
      }
    }
  }
  if (step.required) throw lastError;
  return false;
}

async function runSteps<TPost, TPlatform>(context: DiscoveryMachineContext<TPost, TPlatform>, steps: DiscoveryPlanStep<TPost, TPlatform>[]) {
  for (const step of steps) await runStep(context, step);
}

export async function runDiscoveryStateMachine<TPost, TPlatform>(input: {
  request: PlatformDiscoveryRequest;
  platform: TPlatform;
  plan: PlatformDiscoveryPlan<TPost, TPlatform>;
}) {
  const logs: DiscoveryMachineLog[] = [];
  const posts: TPost[] = [];
  const context: DiscoveryMachineContext<TPost, TPlatform> = {
    request: input.request,
    platform: input.platform,
    termIndex: -1,
    candidateIndex: -1,
    posts,
    logs,
    visitedFingerprints: new Set<string>(),
    state: "session_ready",
    log(level, eventType, message, payload) {
      logs.push({ timestamp: new Date().toISOString(), level, eventType, message, term: context.term, page: context.term ? 1 : undefined, payload: { traceId: input.request.traceId, state: context.state, ...payload } });
    },
  };

  await runSteps(context, input.plan.session);
  for (let termIndex = 0; termIndex < input.request.terms.length; termIndex += 1) {
    context.termIndex = termIndex;
    context.term = input.request.terms[termIndex];
    context.candidateIndex = -1;
    context.visitedFingerprints = new Set<string>();
    context.log("info", "term_started", `开始搜索关键词：${context.term}`, { termIndex });
    let termReady = true;
    try {
      await runSteps(context, input.plan.term);
    } catch (error) {
      termReady = false;
      context.log("error", "search_failed", errorMessage(error), { termIndex });
    }
    let checked = 0;
    const before = posts.length;
    if (termReady) {
      let termPageUnsafe = false;
      for (let candidateIndex = 0; candidateIndex < input.request.policy.candidateLimitPerTerm; candidateIndex += 1) {
        context.candidateIndex = candidateIndex;
        context.candidatePost = undefined;
        checked += 1;
        try {
          await runSteps(context, input.plan.candidate);
        } catch (error) {
          context.log("warn", context.candidatePost ? "candidate_return_failed" : "candidate_incomplete", context.candidatePost ? `候选 ${candidateIndex + 1} 字段已完整，但返回/恢复未完全成功：${errorMessage(error)}` : `候选 ${candidateIndex + 1} 采集未完成：${errorMessage(error)}`, { candidateIndex, candidateComplete: Boolean(context.candidatePost) });
          if (context.candidatePost) termPageUnsafe = true;
        }
        if (context.candidatePost) posts.push(context.candidatePost);
        if (termPageUnsafe) {
          context.log("warn", "term_stopped_after_return_failure", "完整候选已保留，但结果页状态未确认；停止当前追踪词，避免在未知页面继续扫描", { candidateIndex });
          break;
        }
      }
    }
    context.log("info", "term_completed", `关键词完成：检查 ${checked} 个候选，取得 ${posts.length - before} 条字段完整帖子`, { checked, captured: posts.length - before });
    if (termIndex < input.request.terms.length - 1) {
      try { await runSteps(context, input.plan.termSwitch); }
      catch (error) { context.log("warn", "term_switch_failed", errorMessage(error), { nextTerm: input.request.terms[termIndex + 1] }); }
    }
  }
  context.term = undefined;
  context.termIndex = input.request.terms.length;
  await runSteps(context, input.plan.complete);
  return { posts, logs };
}
