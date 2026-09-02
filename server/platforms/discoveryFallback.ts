export type DiscoveryFallbackReason = {
  kind: "primary_error" | "no_qualified_posts";
  message: string;
  terms?: string[];
};

export type DiscoveryWithFallbackResult<TResult, TQualification> = {
  result: TResult;
  qualification: TQualification;
  usedFallback: boolean;
  reason?: DiscoveryFallbackReason;
  primaryResult?: TResult;
  primaryQualification?: TQualification;
  fallbackResult?: TResult;
  fallbackError?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知抓取错误";
}

/**
 * Platform-neutral primary/fallback orchestration.  Qualification is injected
 * by the control plane, so adapters never duplicate hard admission rules.
 */
export async function runDiscoveryWithFallback<TResult, TQualification>(input: {
  primary: () => Promise<TResult>;
  qualify: (result: TResult) => TQualification;
  acceptedCount: (qualification: TQualification) => number;
  missingPartitions?: (qualification: TQualification) => string[];
  mergeResults?: (primary: TResult, fallback: TResult) => TResult;
  fallback?: (reason: DiscoveryFallbackReason) => Promise<TResult>;
}): Promise<DiscoveryWithFallbackResult<TResult, TQualification>> {
  let primaryResult: TResult | undefined;
  let primaryQualification: TQualification | undefined;
  try {
    primaryResult = await input.primary();
    primaryQualification = input.qualify(primaryResult);
  } catch (error) {
    if (!input.fallback) throw error;
    const reason: DiscoveryFallbackReason = { kind: "primary_error", message: errorMessage(error) };
    try {
      const result = await input.fallback(reason);
      return { result, qualification: input.qualify(result), usedFallback: true, reason, primaryResult, fallbackResult: result };
    } catch (fallbackError) {
      throw new Error(`主抓取失败：${reason.message}；视觉回退也失败：${errorMessage(fallbackError)}`, { cause: fallbackError });
    }
  }

  const missingPartitions = input.missingPartitions?.(primaryQualification) ?? [];
  const needsFallback = input.missingPartitions ? missingPartitions.length > 0 : input.acceptedCount(primaryQualification) === 0;
  if (!needsFallback || !input.fallback) {
    return { result: primaryResult, qualification: primaryQualification, usedFallback: false };
  }

  const reason: DiscoveryFallbackReason = {
    kind: "no_qualified_posts",
    message: missingPartitions.length
      ? `主抓取在以下分区没有帖子通过当前硬门槛：${missingPartitions.join("、")}`
      : "主抓取返回的字段完整候选没有一条通过当前硬门槛",
    terms: missingPartitions.length ? missingPartitions : undefined,
  };
  try {
    const fallbackResult = await input.fallback(reason);
    const result = input.mergeResults ? input.mergeResults(primaryResult, fallbackResult) : fallbackResult;
    return { result, qualification: input.qualify(result), usedFallback: true, reason, primaryResult, primaryQualification, fallbackResult };
  } catch (fallbackError) {
    if (input.acceptedCount(primaryQualification) > 0) {
      return { result: primaryResult, qualification: primaryQualification, usedFallback: true, reason, primaryResult, primaryQualification, fallbackError: errorMessage(fallbackError) };
    }
    throw new Error(`主抓取没有合格帖子；视觉回退失败：${errorMessage(fallbackError)}`, { cause: fallbackError });
  }
}
