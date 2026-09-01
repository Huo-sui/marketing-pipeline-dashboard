export const VIRAL_SCORE_VERSION = "velocity-triangle-v1";

export type ViralScoreInput = {
  likes: number;
  comments: number;
  publishedAt: string | Date;
  capturedAt: string | Date;
};

export type ViralScoreCalibration = {
  minLikes: number;
  minComments: number;
  maxAgeHours: number;
};

export type ViralScoreResult = {
  version: typeof VIRAL_SCORE_VERSION;
  total: number;
  ageHours: number;
  likesPerHour: number;
  commentsPerHour: number;
  commentRate: number;
  components: {
    freshness: number;
    likeVelocity: number;
    commentVelocity: number;
    commentRate: number;
    commentStrength: number;
  };
  calibration: {
    freshnessHalfLifeHours: number;
    likeVelocityTarget: number;
    commentVelocityTarget: number;
    commentRateTarget: number;
  };
};

function finiteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label}必须是非负有限数`);
  return value;
}

function boundedScore(value: number, target: number) {
  return 100 * (1 - Math.exp(-value / Math.max(target, Number.EPSILON)));
}

function rounded(value: number, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/**
 * Platform-owned admission score. Collectors provide facts only; this function
 * converts publication age and engagement velocity into a comparable 0–100
 * score. TopicWatch values calibrate the curve, while only minScore decides
 * admission in the control plane.
 */
export function scoreViralPost(input: ViralScoreInput, calibration: ViralScoreCalibration): ViralScoreResult {
  const likes = finiteNonNegative(input.likes, "点赞数");
  const comments = finiteNonNegative(input.comments, "评论数");
  const publishedAt = new Date(input.publishedAt).getTime();
  const capturedAt = new Date(input.capturedAt).getTime();
  if (!Number.isFinite(publishedAt)) throw new Error("发布时间无效，无法评分");
  if (!Number.isFinite(capturedAt)) throw new Error("采集时间无效，无法评分");

  // One hour avoids a near-zero denominator for freshly published posts. A
  // future timestamp is invalid evidence rather than a reason to inflate score.
  const rawAgeHours = (capturedAt - publishedAt) / 3_600_000;
  if (rawAgeHours < -1 / 6) throw new Error("发布时间晚于采集时间，无法评分");
  const ageHours = Math.max(1, rawAgeHours);
  const likesPerHour = likes / ageHours;
  const commentsPerHour = comments / ageHours;
  const commentRate = comments / Math.max(1, likes);

  // Rule values calibrate the curve instead of acting as separate admission
  // gates. A zero comment threshold still receives a meaningful 3% comment
  // reference so it can never award free points.
  const freshnessHalfLifeHours = Math.min(168, Math.max(24, finiteNonNegative(calibration.maxAgeHours, "发布时间窗口")));
  const likeVelocityTarget = Math.max(1, finiteNonNegative(calibration.minLikes, "点赞参考值")) / 24;
  const commentVelocityTarget = Math.max(1, finiteNonNegative(calibration.minComments, "评论参考值"), calibration.minLikes * 0.03) / 24;
  const commentRateTarget = 0.03;

  const freshness = 100 / (1 + ageHours / freshnessHalfLifeHours);
  const likeVelocity = boundedScore(likesPerHour, likeVelocityTarget);
  const commentVelocity = boundedScore(commentsPerHour, commentVelocityTarget);
  const commentRateScore = boundedScore(commentRate, commentRateTarget);
  const commentStrength = commentVelocity * 0.6 + commentRateScore * 0.4;
  const total = freshness * 0.25 + likeVelocity * 0.35 + commentStrength * 0.4;

  return {
    version: VIRAL_SCORE_VERSION,
    total: rounded(Math.min(100, Math.max(0, total)), 1),
    ageHours: rounded(ageHours),
    likesPerHour: rounded(likesPerHour),
    commentsPerHour: rounded(commentsPerHour),
    commentRate: rounded(commentRate, 4),
    components: {
      freshness: rounded(freshness, 1),
      likeVelocity: rounded(likeVelocity, 1),
      commentVelocity: rounded(commentVelocity, 1),
      commentRate: rounded(commentRateScore, 1),
      commentStrength: rounded(commentStrength, 1),
    },
    calibration: {
      freshnessHalfLifeHours,
      likeVelocityTarget: rounded(likeVelocityTarget, 4),
      commentVelocityTarget: rounded(commentVelocityTarget, 4),
      commentRateTarget,
    },
  };
}
