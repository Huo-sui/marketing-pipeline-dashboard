import { scoreViralPost } from "./viralScore.ts";

export type ViralAdmissionInput = {
  likes: number;
  comments: number;
  score: number;
};

export type ViralAdmissionThresholds = {
  minLikes: number;
  minComments: number;
  minScore: number;
};

export function viralAdmissionReasons(input: ViralAdmissionInput, thresholds: ViralAdmissionThresholds) {
  const reasons: string[] = [];
  if (input.likes < thresholds.minLikes) reasons.push(`点赞 ${input.likes} < 硬门槛 ${thresholds.minLikes}`);
  if (input.comments < thresholds.minComments) reasons.push(`评论 ${input.comments} < 硬门槛 ${thresholds.minComments}`);
  if (input.score < thresholds.minScore) reasons.push(`三角评分 ${input.score.toFixed(1)} < 硬门槛 ${thresholds.minScore}`);
  return reasons;
}

export function viralAdmissionPassedMessage(input: ViralAdmissionInput, thresholds: ViralAdmissionThresholds) {
  return `硬门槛通过：点赞 ${input.likes} ≥ ${thresholds.minLikes}，评论 ${input.comments} ≥ ${thresholds.minComments}，三角评分 ${input.score.toFixed(1)} ≥ ${thresholds.minScore}`;
}

export function evaluateViralAdmission(
  evidence: { likes: number | null; comments: number | null; publishedAt: Date | null; capturedAt: Date },
  thresholds: ViralAdmissionThresholds & { maxAgeHours: number },
) {
  if (evidence.likes === null || evidence.comments === null || !evidence.publishedAt) {
    return { passed: false, score: 0, reasons: ["缺少发布时间或互动原始值"], scoring: undefined };
  }
  try {
    const scoring = scoreViralPost(
      { likes: evidence.likes, comments: evidence.comments, publishedAt: evidence.publishedAt, capturedAt: evidence.capturedAt },
      { minLikes: thresholds.minLikes, minComments: thresholds.minComments, maxAgeHours: thresholds.maxAgeHours },
    );
    const reasons = viralAdmissionReasons({ likes: evidence.likes, comments: evidence.comments, score: scoring.total }, thresholds);
    return { passed: reasons.length === 0, score: scoring.total, reasons, scoring };
  } catch (error) {
    return { passed: false, score: 0, reasons: [error instanceof Error ? error.message : "评分失败"], scoring: undefined };
  }
}
