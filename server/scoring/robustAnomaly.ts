export type EngagementObservation = {
  likes: number;
  comments: number;
  ageHours: number;
};

export type RobustAnomalyPolicy = {
  minSamples: number;
  zThreshold: number;
};

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function logVelocity(observation: EngagementObservation, metric: "likes" | "comments") {
  return Math.log1p(Math.max(0, observation[metric]) / Math.max(1, observation.ageHours));
}

function commentRate(observation: EngagementObservation) {
  return Math.log1p(Math.max(0, observation.comments) / Math.max(1, observation.likes) * 1_000);
}

function modifiedZScore(value: number, baseline: number[]) {
  const center = median(baseline);
  const deviation = median(baseline.map((item) => Math.abs(item - center)));
  if (deviation === 0) return value > center ? Number.POSITIVE_INFINITY : 0;
  return 0.6745 * (value - center) / deviation;
}

export function scorePositiveEngagementOutlier(
  candidate: EngagementObservation,
  cohort: EngagementObservation[],
  policy: RobustAnomalyPolicy,
) {
  if (cohort.length < policy.minSamples) {
    return { state: "insufficient_baseline" as const, cohortSize: cohort.length };
  }
  const likeScore = modifiedZScore(logVelocity(candidate, "likes"), cohort.map((item) => logVelocity(item, "likes")));
  const commentScore = modifiedZScore(logVelocity(candidate, "comments"), cohort.map((item) => logVelocity(item, "comments")));
  const commentRateScore = modifiedZScore(commentRate(candidate), cohort.map(commentRate));
  const score = Math.max(likeScore, commentScore, commentRateScore);
  return {
    state: score >= policy.zThreshold ? "positive_outlier" as const : "normal" as const,
    cohortSize: cohort.length,
    score,
    likeScore,
    commentScore,
    commentRateScore,
  };
}

export function engagementAgeBucket(ageHours: number) {
  if (ageHours <= 24) return "0-24h";
  if (ageHours <= 72) return "24-72h";
  if (ageHours <= 168) return "3-7d";
  if (ageHours <= 720) return "7-30d";
  return "30d+";
}
