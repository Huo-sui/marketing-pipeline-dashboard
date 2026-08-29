import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type ReviewStatus } from "@prisma/client";
import { ValidationError } from "../validation/input.js";

export type InsightKind = "inspiration" | "pain_point" | "feedback";
export type InsightEvidenceType = "post" | "comment" | "inference";

function safeSourceEvidence(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, Prisma.JsonValue>;
  const safeKeys = ["source", "term", "candidate", "resultAccessibilityLabel", "publicationEvidence", "publicationScrollAttempts", "shareLinkResolved"];
  return Object.fromEntries(safeKeys.flatMap((key) => record[key] === undefined ? [] : [[key, record[key]]]));
}

export type InsightInput = {
  projectId: string;
  sourcePostId?: string;
  ideaId?: string;
  kind: InsightKind;
  title: string;
  detail: string;
  evidenceType: InsightEvidenceType;
  commentIds: string[];
  status?: ReviewStatus;
  createdBy?: string;
};

async function ownedSourcePost(db: PrismaClient, workspaceId: string, sourcePostId: string) {
  const sourcePost = await db.sourcePost.findFirst({ where: { id: sourcePostId, workspaceId } });
  if (!sourcePost) throw new ValidationError("来源帖不存在或不属于当前 Workspace");
  return sourcePost;
}

export async function getSourceAnalysisContext(db: PrismaClient, workspaceId: string, sourcePostId: string) {
  const sourcePost = await ownedSourcePost(db, workspaceId, sourcePostId);
  const [project, metrics, matches, assets, assetVersions, comments, card] = await Promise.all([
    db.project.findFirstOrThrow({ where: { id: sourcePost.projectId, workspaceId } }),
    db.sourceMetricSnapshot.findMany({ where: { sourcePostId, workspaceId }, orderBy: { capturedAt: "desc" } }),
    db.sourcePostMatch.findMany({ where: { sourcePostId, workspaceId }, orderBy: { createdAt: "desc" } }),
    db.asset.findMany({ where: { projectId: sourcePost.projectId, workspaceId, status: "available" }, orderBy: { updatedAt: "desc" } }),
    db.assetVersion.findMany({ where: { projectId: sourcePost.projectId, workspaceId }, orderBy: { version: "desc" } }),
    db.sourceComment.findMany({ where: { sourcePostId, workspaceId }, orderBy: [{ likes: "desc" }, { capturedAt: "desc" }] }),
    db.patternCard.findFirst({ where: { sourcePostId, workspaceId } }),
  ]);
  const topicIds = [...new Set(matches.map((match) => match.topicWatchId).filter((id): id is string => Boolean(id)))];
  const [topics, analysis] = await Promise.all([
    topicIds.length ? db.topicWatch.findMany({ where: { id: { in: topicIds }, workspaceId } }) : [],
    card ? db.patternCardVersion.findFirst({ where: { patternCardId: card.id, workspaceId }, orderBy: { version: "desc" } }) : null,
  ]);
  const latestAssetVersion = new Map<string, typeof assetVersions[number]>();
  for (const version of assetVersions) if (!latestAssetVersion.has(version.assetId)) latestAssetVersion.set(version.assetId, version);
  return {
    project: {
      id: project.id,
      name: project.name,
      type: project.type,
      stage: project.stage,
      description: project.description,
      targetMarkets: project.targetMarkets,
      languages: project.languages,
      platforms: project.platforms,
    },
    sourcePost: { id: sourcePost.id, projectId: sourcePost.projectId, platform: sourcePost.platform, externalId: sourcePost.externalId, canonicalUrl: sourcePost.canonicalUrl, author: sourcePost.author, title: sourcePost.title, body: sourcePost.body, publishedAt: sourcePost.publishedAt, capturedAt: sourcePost.capturedAt, mediaType: sourcePost.mediaType, reviewState: sourcePost.reviewState, action: sourcePost.action, rawEvidence: safeSourceEvidence(sourcePost.rawPayload) },
    metrics: metrics.map((metric) => ({ id: metric.id, capturedAt: metric.capturedAt, likes: metric.likes, comments: metric.comments, shares: metric.shares, saves: metric.saves, views: metric.views, score: metric.score })),
    matches: matches.map((match) => ({ id: match.id, topicWatchId: match.topicWatchId, score: match.score, reason: match.reason, createdAt: match.createdAt })),
    topics: topics.map((topic) => ({ id: topic.id, name: topic.name, platform: topic.platform, terms: topic.terms, excludeTerms: topic.excludeTerms, minLikes: topic.minLikes, minComments: topic.minComments, maxAgeHours: topic.maxAgeHours, minScore: topic.minScore })),
    assets: assets.map((asset) => { const version = latestAssetVersion.get(asset.id); return { id: asset.id, name: asset.name, type: asset.type, usage: asset.usage, status: asset.status, version: version ? { id: version.id, version: version.version, tags: version.tags } : undefined }; }),
    comments: comments.map((comment) => ({ id: comment.id, body: comment.body, likes: comment.likes, publishedAt: comment.publishedAt, capturedAt: comment.capturedAt, evidenceHash: comment.evidenceHash })),
    analysis: analysis ? { id: card?.id, version: analysis.version, payload: analysis.payload, provider: analysis.provider, promptVersion: analysis.promptVersion, createdAt: analysis.createdAt } : null,
  };
}

export async function saveSourceAnalysis(
  db: PrismaClient,
  workspaceId: string,
  sourcePostId: string,
  payload: Prisma.InputJsonValue,
  options: { provider: string; providerVersion?: string; promptVersion?: string },
) {
  const sourcePost = await ownedSourcePost(db, workspaceId, sourcePostId);
  const existing = await db.patternCard.findFirst({ where: { sourcePostId, workspaceId } });
  const nextVersion = (existing?.currentVersion ?? 0) + 1;
  const traceId = randomUUID();
  return db.$transaction(async (tx) => {
    const card = existing
      ? await tx.patternCard.update({ where: { id: existing.id }, data: { currentVersion: nextVersion } })
      : await tx.patternCard.create({ data: { workspaceId, projectId: sourcePost.projectId, sourcePostId, currentVersion: nextVersion } });
    const version = await tx.patternCardVersion.create({ data: { workspaceId, projectId: sourcePost.projectId, patternCardId: card.id, version: nextVersion, payload, provider: options.provider, providerVersion: options.providerVersion, promptVersion: options.promptVersion } });
    const agentRun = await tx.agentRun.create({ data: { workspaceId, projectId: sourcePost.projectId, kind: "viral-topic-analysis", status: "completed", provider: options.provider, providerVersion: options.providerVersion, promptVersion: options.promptVersion, traceId, inputSnapshot: { sourcePostId }, outputSnapshot: payload, startedAt: new Date(), completedAt: new Date() } });
    await tx.auditLog.create({ data: { workspaceId, projectId: sourcePost.projectId, actor: "control-api", action: existing ? "analysis.versioned" : "analysis.created", entityType: "pattern_card", entityId: card.id, after: { sourcePostId, version: nextVersion, provider: options.provider }, traceId } });
    return { card, version, agentRunId: agentRun.id, traceId };
  });
}

async function validateInsightEvidence(db: PrismaClient, workspaceId: string, input: InsightInput) {
  const project = await db.project.findFirst({ where: { id: input.projectId, workspaceId } });
  if (!project) throw new ValidationError("项目不存在或不属于当前 Workspace");
  if (input.sourcePostId) {
    const source = await db.sourcePost.findFirst({ where: { id: input.sourcePostId, projectId: input.projectId, workspaceId } });
    if (!source) throw new ValidationError("灵感来源帖不存在或不属于当前项目");
  }
  if (input.ideaId) {
    const idea = await db.idea.findFirst({ where: { id: input.ideaId, projectId: input.projectId, workspaceId } });
    if (!idea) throw new ValidationError("灵感关联选题不存在或不属于当前项目");
  }
  if (input.commentIds.length) {
    const count = await db.sourceComment.count({ where: { id: { in: input.commentIds }, projectId: input.projectId, workspaceId, ...(input.sourcePostId ? { sourcePostId: input.sourcePostId } : {}) } });
    if (count !== input.commentIds.length) throw new ValidationError("部分评论证据不存在或不属于当前项目");
  }
}

export async function listInsights(db: PrismaClient, workspaceId: string, projectId?: string) {
  return db.insight.findMany({ where: { workspaceId, ...(projectId ? { projectId } : {}) }, orderBy: { updatedAt: "desc" } });
}

export async function createInsight(db: PrismaClient, workspaceId: string, input: InsightInput) {
  await validateInsightEvidence(db, workspaceId, input);
  return db.$transaction(async (tx) => {
    const insight = await tx.insight.create({ data: { workspaceId, projectId: input.projectId, sourcePostId: input.sourcePostId, ideaId: input.ideaId, kind: input.kind, title: input.title, detail: input.detail, evidenceType: input.evidenceType, commentIds: input.commentIds, status: input.status ?? "pending", createdBy: input.createdBy ?? "dashboard" } });
    await tx.auditLog.create({ data: { workspaceId, projectId: input.projectId, actor: "control-api", action: "insight.created", entityType: "insight", entityId: insight.id, after: { kind: insight.kind, status: insight.status, evidenceType: insight.evidenceType, submittedBy: input.createdBy ?? "dashboard" } } });
    return insight;
  });
}

export async function patchInsight(db: PrismaClient, workspaceId: string, projectId: string, insightId: string, patch: Partial<InsightInput>) {
  const current = await db.insight.findFirst({ where: { id: insightId, workspaceId, projectId } });
  if (!current) throw new ValidationError("灵感记录不存在或不属于当前项目");
  const merged: InsightInput = {
    projectId: current.projectId,
    sourcePostId: patch.sourcePostId === undefined ? current.sourcePostId ?? undefined : patch.sourcePostId,
    ideaId: patch.ideaId === undefined ? current.ideaId ?? undefined : patch.ideaId,
    kind: patch.kind ?? current.kind as InsightKind,
    title: patch.title ?? current.title,
    detail: patch.detail ?? current.detail,
    evidenceType: patch.evidenceType ?? current.evidenceType as InsightEvidenceType,
    commentIds: patch.commentIds ?? current.commentIds,
    status: patch.status ?? current.status,
    createdBy: current.createdBy ?? undefined,
  };
  await validateInsightEvidence(db, workspaceId, merged);
  return db.$transaction(async (tx) => {
    const insight = await tx.insight.update({ where: { id: insightId }, data: { sourcePostId: merged.sourcePostId ?? null, ideaId: merged.ideaId ?? null, kind: merged.kind, title: merged.title, detail: merged.detail, evidenceType: merged.evidenceType, commentIds: merged.commentIds, status: merged.status } });
    await tx.auditLog.create({ data: { workspaceId, projectId: current.projectId, actor: "control-api", action: "insight.updated", entityType: "insight", entityId: insightId, before: { kind: current.kind, status: current.status, evidenceType: current.evidenceType }, after: { kind: insight.kind, status: insight.status, evidenceType: insight.evidenceType } } });
    return insight;
  });
}
