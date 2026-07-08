import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.PRISMA_LOG_LEVEL 
        ? (process.env.PRISMA_LOG_LEVEL.split(",") as any) 
        : ["error", "warn"],
    });
  }
  return prisma;
}

export { PrismaClient };
export * from "@prisma/client";
export type * from "@prisma/client";
