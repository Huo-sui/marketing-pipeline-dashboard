import { randomUUID } from "node:crypto";
import { Prisma, type ContentDraftStatus, type PrismaClient } from "@prisma/client";
import { ValidationError } from "../validation/input.js";

export type ContentDraftInput = {
  projectId: string;
  ideaId: string;
  title?: string;
  copy?: string;
  format?: string;
  assetStrategy?: string;
  assetIds?: string[];
  imageBrief?: string;
  videoBrief?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  createdBy?: string;
};

async function latestIdeaContext(db: PrismaClient, workspaceId: string, projectId: string, ideaId: string) {
  const idea = await db.idea.findFirst({ where: { id: ideaId, projectId, workspaceId } });
  if (!idea) throw new ValidationError("选题不存在或不属于当前项目");
  if (idea.status !== "approved") throw new ValidationError("只有人工终审通过的选题才能创建待审草稿");
  const revision = await db.ideaRevision.findFirst({ where: { ideaId, projectId, workspaceId }, orderBy: { version: "desc" } });
  if (!revision) throw new ValidationError("选题没有可用修订版本");
  const ideaSources = await db.ideaSource.findMany({ where: { ideaId, projectId, workspaceId } });
  const sourcePostIds = ideaSources.map((source) => source.sourcePostId).filter((id): id is string => Boolean(id));
  const sourcePosts = sourcePostIds.length ? await db.sourcePost.findMany({ where: { id: { in: sourcePostIds }, projectId, workspaceId } }) : [];
  const versionIds = ideaSources.map((source) => source.patternCardVersionId).filter((id): id is string => Boolean(id));
  if (ideaSources.some((source) => source.patternCardId && !source.patternCardVersionId)) throw new ValidationError("选题来源缺少锁定的爆帖分析版本，请重新生成该选题");
  const versions = versionIds.length ? await db.patternCardVersion.findMany({ where: { id: { in: versionIds }, projectId, workspaceId } }) : [];
  if (versions.length !== versionIds.length) throw new ValidationError("选题引用的爆帖分析版本不存在或不属于当前项目");
  const versionById = new Map(versions.map((version) => [version.id, version]));
  return {
    idea,
    revision,
    sourceSnapshot: {
      idea: { id: idea.id, title: idea.title, version: idea.currentVersion },
      sourcePosts: sourcePosts.map((post) => ({ id: post.id, platform: post.platform, externalId: post.externalId, canonicalUrl: post.canonicalUrl, author: post.author, title: post.title, publishedAt: post.publishedAt?.toISOString() ?? null, mediaType: post.mediaType })),
      analyses: ideaSources.flatMap((source) => { const version = source.patternCardVersionId ? versionById.get(source.patternCardVersionId) : undefined; return source.sourcePostId && source.patternCardId && version ? [{ sourcePostId: source.sourcePostId, patternCardId: source.patternCardId, patternCardVersionId: version.id, version: version.version }] : []; }),
    },
  };
}

async function validateAssets(db: PrismaClient, workspaceId: string, projectId: string, assetIds: string[]) {
  if (!assetIds.length) return;
  const count = await db.asset.count({ where: { id: { in: assetIds }, workspaceId, projectId, status: "available" } });
  if (count !== assetIds.length) throw new ValidationError("部分草稿资产不存在或不属于当前项目");
}

export async function createContentDraft(db: PrismaClient, workspaceId: string, input: ContentDraftInput) {
  const context = await latestIdeaContext(db, workspaceId, input.projectId, input.ideaId);
  const assetIds = input.assetIds ?? context.revision.assetIds;
  await validateAssets(db, workspaceId, input.projectId, assetIds);
  const traceId = randomUUID();
  return db.$transaction(async (tx) => {
    const draft = await tx.contentDraft.create({ data: { workspaceId, projectId: input.projectId, ideaId: input.ideaId, status: "pending_review", currentVersion: 1 } });
    const revision = await tx.contentDraftRevision.create({ data: { workspaceId, projectId: input.projectId, contentDraftId: draft.id, version: 1, title: input.title ?? context.idea.title, copy: input.copy ?? context.revision.copy, format: input.format ?? context.idea.format, assetStrategy: input.assetStrategy ?? context.revision.assetDecision ?? "pending", assetIds, imageBrief: input.imageBrief ?? context.revision.imageBrief, videoBrief: input.videoBrief === undefined ? context.revision.videoBrief ?? undefined : input.videoBrief, sourceSnapshot: context.sourceSnapshot, createdBy: input.createdBy ?? "dashboard" } });
    await tx.auditLog.create({ data: { workspaceId, projectId: input.projectId, actor: "control-api", action: "content_draft.created", entityType: "content_draft", entityId: draft.id, after: { ideaId: input.ideaId, version: 1, submittedBy: input.createdBy ?? "dashboard" }, traceId } });
    return { ...draft, revision, traceId };
  });
}

export async function listContentDrafts(db: PrismaClient, workspaceId: string, projectId?: string) {
  const drafts = await db.contentDraft.findMany({ where: { workspaceId, ...(projectId ? { projectId } : {}) }, orderBy: { updatedAt: "desc" } });
  const revisions = drafts.length ? await db.contentDraftRevision.findMany({ where: { contentDraftId: { in: drafts.map((draft) => draft.id) }, workspaceId }, orderBy: { version: "desc" } }) : [];
  const latest = new Map<string, typeof revisions[number]>();
  for (const revision of revisions) if (!latest.has(revision.contentDraftId)) latest.set(revision.contentDraftId, revision);
  return drafts.map((draft) => ({ ...draft, revision: latest.get(draft.id) }));
}

export async function patchContentDraft(db: PrismaClient, workspaceId: string, projectId: string, draftId: string, patch: Omit<Partial<ContentDraftInput>, "projectId" | "ideaId">) {
  const current = await db.contentDraft.findFirst({ where: { id: draftId, workspaceId, projectId } });
  if (!current) throw new ValidationError("待审草稿不存在或不属于当前项目");
  const revision = await db.contentDraftRevision.findFirst({ where: { contentDraftId: draftId, workspaceId }, orderBy: { version: "desc" } });
  if (!revision) throw new ValidationError("待审草稿没有可编辑版本");
  const assetIds = patch.assetIds ?? revision.assetIds;
  await validateAssets(db, workspaceId, current.projectId, assetIds);
  const nextVersion = current.currentVersion + 1;
  const traceId = randomUUID();
  return db.$transaction(async (tx) => {
    const draft = await tx.contentDraft.update({ where: { id: draftId }, data: { currentVersion: nextVersion, status: "pending_review" } });
    const next = await tx.contentDraftRevision.create({ data: { workspaceId, projectId: current.projectId, contentDraftId: draftId, version: nextVersion, title: patch.title ?? revision.title, copy: patch.copy ?? revision.copy, format: patch.format ?? revision.format, assetStrategy: patch.assetStrategy ?? revision.assetStrategy, assetIds, imageBrief: patch.imageBrief === undefined ? revision.imageBrief : patch.imageBrief, videoBrief: patch.videoBrief === undefined ? revision.videoBrief ?? undefined : patch.videoBrief, sourceSnapshot: revision.sourceSnapshot as Prisma.InputJsonValue, createdBy: patch.createdBy ?? "dashboard" } });
    await tx.auditLog.create({ data: { workspaceId, projectId: current.projectId, actor: "control-api", action: "content_draft.versioned", entityType: "content_draft", entityId: draftId, before: { version: revision.version, status: current.status }, after: { version: nextVersion, status: "pending_review", submittedBy: patch.createdBy ?? "dashboard" }, traceId } });
    return { ...draft, revision: next, traceId };
  });
}

export async function reviewContentDraft(db: PrismaClient, workspaceId: string, projectId: string, draftId: string, status: ContentDraftStatus, reason?: string) {
  const current = await db.contentDraft.findFirst({ where: { id: draftId, workspaceId, projectId } });
  if (!current) throw new ValidationError("待审草稿不存在或不属于当前项目");
  const revision = await db.contentDraftRevision.findFirst({ where: { contentDraftId: draftId, workspaceId }, orderBy: { version: "desc" } });
  if (!revision) throw new ValidationError("待审草稿没有可审核版本");
  if (status === "approved" && (!revision.title.trim() || !revision.copy.trim())) throw new ValidationError("批准前必须填写标题和文案");
  const reviewStatus = status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending";
  return db.$transaction(async (tx) => {
    const draft = await tx.contentDraft.update({ where: { id: draftId }, data: { status } });
    await tx.reviewDecision.create({ data: { workspaceId, projectId: current.projectId, entityType: "content_draft", entityId: draftId, status: reviewStatus, reason, reviewer: "dashboard", objectVersion: revision.version } });
    await tx.auditLog.create({ data: { workspaceId, projectId: current.projectId, actor: "dashboard", action: `content_draft.${status}`, entityType: "content_draft", entityId: draftId, before: { status: current.status }, after: { status, version: revision.version } } });
    return { ...draft, revision };
  });
}
