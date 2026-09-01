import { PrismaClient } from "@prisma/client";

const prismaGlobal = globalThis as typeof globalThis & { __marketingPipelinePrisma?: PrismaClient };

export class DatabaseUnavailableError extends Error {
  readonly code = "DATABASE_UNAVAILABLE";

  constructor(message = "PostgreSQL 未连接。请配置 DATABASE_URL，并先执行 prisma migrate deploy。") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

export function getPrismaClient() {
  if (!process.env.DATABASE_URL) throw new DatabaseUnavailableError("未配置 DATABASE_URL，Control API 不会回退到 Demo 数据。");
  prismaGlobal.__marketingPipelinePrisma ??= new PrismaClient({ log: ["error"] });
  return prismaGlobal.__marketingPipelinePrisma;
}

export async function checkDatabase() {
  try {
    await getPrismaClient().$queryRaw`SELECT 1`;
    return { configured: true, connected: true };
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) throw error;
    throw new DatabaseUnavailableError(error instanceof Error ? error.message : "PostgreSQL 连接失败");
  }
}

export async function disconnectDatabase() {
  if (prismaGlobal.__marketingPipelinePrisma) await prismaGlobal.__marketingPipelinePrisma.$disconnect();
  prismaGlobal.__marketingPipelinePrisma = undefined;
}
