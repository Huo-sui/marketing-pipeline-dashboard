import type { PrismaClient } from "@prisma/client";

export async function ensureWorkspace(db: PrismaClient, workspaceId?: string) {
  if (workspaceId) {
    const existing = await db.workspace.findUnique({ where: { id: workspaceId } });
    if (existing) return existing;
  }
  const existing = await db.workspace.findFirst({ orderBy: { createdAt: "asc" } });
  return existing ?? db.workspace.create({ data: { name: "Marketing Pipeline Workspace", timezone: "UTC" } });
}

export async function workspaceSnapshot(db: PrismaClient, workspaceId: string) {
  const [workspace, projects, topicWatches, accounts, runners, bindings] = await Promise.all([
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId } }),
    db.project.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    db.topicWatch.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    db.socialAccount.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    db.accountRunner.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    db.projectAccountBinding.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
  ]);
  return { workspace, projects, topicWatches, accounts, runners, bindings };
}
