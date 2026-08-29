import type { Prisma } from "@prisma/client";
import { objectInput, optionalString, requiredString, stringArray, ValidationError } from "../validation/input.ts";

function analysisStrings(value: unknown, field: string, maxItems = 100, maxLength = 3000) {
  const items = stringArray(value, field);
  if (items.length > maxItems) throw new ValidationError(`${field} 最多包含 ${maxItems} 项`);
  if (items.some((item) => item.length > maxLength)) throw new ValidationError(`${field} 单项长度不能超过 ${maxLength}`);
  return items;
}

function analysisEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new ValidationError(`${field} 必须是 ${allowed.join("、")} 之一`);
  return value as T;
}

export function validateAnalysisPayload(value: unknown): Prisma.InputJsonObject {
  const payload = objectInput(value);
  const rawReasons = Array.isArray(payload.viralReasons) ? payload.viralReasons : (() => { throw new ValidationError("analysis.viralReasons 必须是数组"); })();
  const production = objectInput(payload.production);
  const replication = objectInput(payload.replicationDecision);
  const rawTopics = Array.isArray(payload.topicCandidates) ? payload.topicCandidates : (() => { throw new ValidationError("analysis.topicCandidates 必须是数组"); })();
  const rawInsights = Array.isArray(payload.insights) ? payload.insights : (() => { throw new ValidationError("analysis.insights 必须是数组"); })();
  if (rawReasons.length > 50 || rawTopics.length > 50 || rawInsights.length > 100) throw new ValidationError("分析条目数量超出上限");
  return {
    summary: requiredString(payload.summary, "analysis.summary", 3000),
    viralReasons: rawReasons.map((value, index) => { const item = objectInput(value); return { claim: requiredString(item.claim, `analysis.viralReasons[${index}].claim`, 2000), evidence: analysisStrings(item.evidence, `analysis.viralReasons[${index}].evidence`, 30, 2000), confidence: analysisEnum(item.confidence, `analysis.viralReasons[${index}].confidence`, ["high", "medium", "low"] as const) }; }),
    production: {
      mediaType: analysisEnum(production.mediaType, "analysis.production.mediaType", ["video", "image_text", "text"] as const),
      hook: requiredString(production.hook, "analysis.production.hook", 3000),
      structure: analysisStrings(production.structure, "analysis.production.structure", 50),
      videoMethod: analysisStrings(production.videoMethod, "analysis.production.videoMethod", 50),
      writingMethod: analysisStrings(production.writingMethod, "analysis.production.writingMethod", 50),
      imageTypes: analysisStrings(production.imageTypes, "analysis.production.imageTypes", 50),
    },
    replicationDecision: {
      verdict: analysisEnum(replication.verdict, "analysis.replicationDecision.verdict", ["adapt", "inspire", "reject"] as const),
      reason: requiredString(replication.reason, "analysis.replicationDecision.reason", 3000),
      portableElements: analysisStrings(replication.portableElements, "analysis.replicationDecision.portableElements", 50),
      mustReplace: analysisStrings(replication.mustReplace, "analysis.replicationDecision.mustReplace", 50),
    },
    topicCandidates: rawTopics.map((value, index) => { const item = objectInput(value); const imageBrief = optionalString(item.imageBrief, `analysis.topicCandidates[${index}].imageBrief`, 10_000); const videoPlaceholder = optionalString(item.videoPlaceholder, `analysis.topicCandidates[${index}].videoPlaceholder`, 10_000); return {
      title: requiredString(item.title, `analysis.topicCandidates[${index}].title`, 300), hook: requiredString(item.hook, `analysis.topicCandidates[${index}].hook`, 3000), format: analysisEnum(item.format, `analysis.topicCandidates[${index}].format`, ["视频", "图文", "纯文本"] as const), copyOutline: analysisStrings(item.copyOutline, `analysis.topicCandidates[${index}].copyOutline`, 50), assetStrategy: analysisEnum(item.assetStrategy, `analysis.topicCandidates[${index}].assetStrategy`, ["reuse_project_asset", "generate_style_similar", "no_asset"] as const), assetIds: analysisStrings(item.assetIds, `analysis.topicCandidates[${index}].assetIds`, 100, 100), ...(imageBrief ? { imageBrief } : {}), ...(videoPlaceholder ? { videoPlaceholder } : {}),
    }; }),
    insights: rawInsights.map((value, index) => { const item = objectInput(value); return { kind: analysisEnum(item.kind, `analysis.insights[${index}].kind`, ["inspiration", "pain_point", "feedback"] as const), title: requiredString(item.title, `analysis.insights[${index}].title`, 300), detail: requiredString(item.detail, `analysis.insights[${index}].detail`, 5000), evidenceType: analysisEnum(item.evidenceType, `analysis.insights[${index}].evidenceType`, ["post", "comment", "inference"] as const), commentIds: analysisStrings(item.commentIds, `analysis.insights[${index}].commentIds`, 200, 100) }; }),
    limitations: analysisStrings(payload.limitations, "analysis.limitations", 100),
  };
}
