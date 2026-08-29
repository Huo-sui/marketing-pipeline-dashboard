import { Prisma, type PrismaClient } from "@prisma/client";
import { getPublisher, type PublisherResult } from "../publishers.js";
import { ValidationError } from "../validation/input.js";

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value, (_, item) => item instanceof Date ? item.toISOString() : typeof item === "bigint" ? item.toString() : item)) as Prisma.InputJsonValue;
}

async function lockedPublicationContext(db: PrismaClient, workspaceId: string, projectId: string, publicationDraftId: string) {
  const draft = await db.publicationDraft.findFirst({ where: { id: publicationDraftId, workspaceId, projectId } });
  if (!draft?.contentDraftId || !draft.renditionId || !draft.accountId) throw new ValidationError("发布对象不存在或缺少锁定草稿、平台版本、账号");
  const [contentDraft, rendition, account, runner, binding] = await Promise.all([
    db.contentDraft.findFirst({ where: { id: draft.contentDraftId, workspaceId, projectId: draft.projectId } }),
    db.platformRendition.findFirst({ where: { id: draft.renditionId, workspaceId, projectId: draft.projectId } }),
    db.socialAccount.findFirst({ where: { id: draft.accountId, workspaceId, lifecycleStatus: "active" } }),
    db.accountRunner.findFirst({ where: { accountId: draft.accountId, workspaceId } }),
    db.projectAccountBinding.findFirst({ where: { projectId: draft.projectId, accountId: draft.accountId, workspaceId, roles: { has: "publishing" } } }),
  ]);
  if (!contentDraft || contentDraft.status !== "approved") throw new ValidationError("来源待审草稿已变更或不再是批准状态");
  if (!rendition || rendition.platform !== draft.platform || rendition.version !== contentDraft.currentVersion) throw new ValidationError("发布对象不是当前已批准草稿版本，请重新创建发布对象");
  if (!account || account.platform !== draft.platform) throw new ValidationError("发布账号不存在或平台不匹配");
  if (!binding) throw new ValidationError("发布账号没有当前项目的 Publishing 角色");
  const revision = await db.contentDraftRevision.findFirst({ where: { contentDraftId: contentDraft.id, version: rendition.version, workspaceId, projectId: draft.projectId } });
  if (!revision) throw new ValidationError("发布对象引用的草稿版本不存在");
  const assetVersions = revision.assetIds.length ? await db.assetVersion.findMany({ where: { assetId: { in: revision.assetIds }, workspaceId, projectId: draft.projectId, artifactId: { not: null } }, orderBy: { version: "desc" } }) : [];
  const latestAssetVersion = new Map<string, typeof assetVersions[number]>();
  for (const version of assetVersions) if (!latestAssetVersion.has(version.assetId)) latestAssetVersion.set(version.assetId, version);
  const artifactIds = revision.assetIds.flatMap((assetId) => latestAssetVersion.get(assetId)?.artifactId ?? []);
  const artifacts = artifactIds.length ? await db.artifact.findMany({ where: { id: { in: artifactIds }, workspaceId, status: "ready" } }) : [];
  if (revision.assetStrategy === "pending") throw new ValidationError("发布前必须明确图片/资产策略");
  if (revision.assetIds.length && artifacts.length !== revision.assetIds.length) throw new ValidationError("部分发布资产没有可用 Artifact");
  if ((revision.assetStrategy === "matched" || revision.assetStrategy === "needs_generation" || revision.assetStrategy === "reuse_project_asset" || revision.assetStrategy === "generate_style_similar") && !revision.assetIds.length) throw new ValidationError("当前资产策略要求至少一个已登记的项目或生成资产");
  return { draft, contentDraft, revision, rendition, account, runner, artifacts };
}

export async function approvePublicationDraft(db: PrismaClient, workspaceId: string, projectId: string, publicationDraftId: string) {
  const context = await lockedPublicationContext(db, workspaceId, projectId, publicationDraftId);
  if (context.draft.status !== "draft") throw new ValidationError("发布对象不存在或当前状态不可审批");
  return db.$transaction(async (tx) => {
    const draft = await tx.publicationDraft.update({ where: { id: publicationDraftId }, data: { status: "approved", errorCode: null, errorMessage: null } });
    await tx.auditLog.create({ data: { workspaceId, projectId: draft.projectId, actor: "dashboard", action: "publication_draft.approved", entityType: "publication_draft", entityId: draft.id, after: { contentDraftId: draft.contentDraftId, renditionId: draft.renditionId } } });
    return draft;
  });
}

async function finishAttempt(db: PrismaClient, workspaceId: string, publicationDraftId: string, attemptId: string, result: PublisherResult) {
  return db.$transaction(async (tx) => {
    await tx.publicationAttempt.update({ where: { id: attemptId }, data: { status: result.status, externalRequestId: result.externalRequestId, errorCode: result.status === "succeeded" ? null : result.code, errorMessage: result.status === "succeeded" ? null : result.message } });
    const draft = await tx.publicationDraft.update({ where: { id: publicationDraftId }, data: { status: result.status, errorCode: result.status === "succeeded" ? null : result.code, errorMessage: result.status === "succeeded" ? null : result.message } });
    if (result.status === "succeeded") {
      await tx.publicationReceipt.create({ data: { workspaceId, projectId: draft.projectId, publicationDraftId, platformPostId: result.platformPostId, canonicalUrl: result.canonicalUrl, publishedAt: new Date(result.publishedAt), rawPayload: result.evidence ? jsonInput(result.evidence) : undefined } });
    }
    await tx.auditLog.create({ data: { workspaceId, projectId: draft.projectId, actor: "publisher", action: `publication_draft.${result.status}`, entityType: "publication_draft", entityId: draft.id, after: jsonInput(result) } });
    return draft;
  });
}

export async function executePublicationDraft(db: PrismaClient, workspaceId: string, projectId: string, publicationDraftId: string) {
  const context = await lockedPublicationContext(db, workspaceId, projectId, publicationDraftId);
  if (context.draft.status !== "approved" && context.draft.status !== "failed_retryable") throw new ValidationError("发布对象必须先审批，且未知提交结果不能自动重试");
  const publisher = getPublisher(context.draft.platform);
  if (publisher?.requirements.confirmedIdentity && !context.account.identityConfirmedAt) throw new ValidationError("Publisher 要求先确认发布账号身份");
  if (publisher?.requirements.phoneRunner && (!context.runner || context.runner.sessionStatus !== "healthy" || !context.runner.deviceId || !context.runner.appPackage)) throw new ValidationError("Publisher 要求健康且已绑定设备与 App 的手机 Runner");
  const claimed = await db.$transaction(async (tx) => {
    const changed = await tx.publicationDraft.updateMany({ where: { id: publicationDraftId, workspaceId, status: { in: ["approved", "failed_retryable"] } }, data: { status: "submitting", errorCode: null, errorMessage: null } });
    if (!changed.count) throw new ValidationError("发布对象正在执行或当前状态不可重试");
    const attemptNo = await tx.publicationAttempt.count({ where: { publicationDraftId, workspaceId } }) + 1;
    return tx.publicationAttempt.create({ data: { workspaceId, projectId: context.draft.projectId, publicationDraftId, attemptNo, status: "submitting" } });
  });
  if (!publisher) {
    return finishAttempt(db, workspaceId, publicationDraftId, claimed.id, { status: "failed_retryable", code: "PUBLISHER_NOT_CONFIGURED", message: `${context.draft.platform} Publisher 尚未配置，未触碰外部平台` });
  }
  try {
    const controlApiPort = /^\d{2,5}$/.test(process.env.MARKETING_PIPELINE_PORT ?? "") ? process.env.MARKETING_PIPELINE_PORT : "3210";
    const result = await publisher.publish({
      publicationDraftId,
      idempotencyKey: context.draft.idempotencyKey ?? publicationDraftId,
      platform: context.draft.platform,
      title: context.rendition.title,
      copy: context.rendition.copy,
      account: { id: context.account.id, externalUserId: context.account.externalUserId ?? undefined, handle: context.account.handle, displayName: context.account.displayName ?? undefined },
      runner: context.runner ? { id: context.runner.id, runnerType: context.runner.runnerType, deviceId: context.runner.deviceId ?? undefined, appPackage: context.runner.appPackage ?? undefined } : undefined,
      artifacts: context.artifacts.map((artifact) => ({ id: artifact.id, storageProvider: artifact.storageProvider, storageKey: artifact.storageKey, mimeType: artifact.mimeType, originalName: artifact.originalName ?? undefined, sha256: artifact.sha256, contentUrl: `http://127.0.0.1:${controlApiPort}/api/v1/artifacts/${artifact.id}/content` })),
    });
    return finishAttempt(db, workspaceId, publicationDraftId, claimed.id, result);
  } catch (error) {
    // Once a configured adapter starts, an unclassified exception may have happened
    // after submission. Do not auto-retry and risk duplicate publication.
    const message = error instanceof Error ? error.message : "Publisher 执行结果未知";
    return finishAttempt(db, workspaceId, publicationDraftId, claimed.id, { status: "unknown_requires_review", code: "PUBLISH_RESULT_UNKNOWN", message });
  }
}
