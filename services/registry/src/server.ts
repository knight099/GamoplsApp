import { buildApp } from "./build-app.js";
import { PrismaRegistryStore } from "./prisma-registry-store.js";
import { RegistryStore } from "./registry-store.js";
import { getPrismaClient } from "@gamopls/db";
import type { IRegistryStore } from "./prisma-registry-store.js";

const databaseUrl = process.env.DATABASE_URL;
let store: IRegistryStore;

if (databaseUrl) {
  console.log("registry: using Neon Postgres database via Prisma");
  const prisma = getPrismaClient();
  store = new PrismaRegistryStore(prisma);
} else {
  console.warn("DATABASE_URL not set — registry is running with an in-memory (non-persistent) store.");
  store = new RegistryStore();
}

const app = buildApp({ store });
const port = Number(process.env.PORT ?? 4400);
const host = process.env.HOST ?? "127.0.0.1";

app
  .listen({ port, host })
  .then(() => {
    app.log.info(`registry listening on http://${host}:${port}`);
  })
  .catch((err) => {
    console.error("registry failed to start:", err);
    process.exit(1);
  });
