import { LocalDiskStorageProvider } from "./storage.js";
import { InMemoryDocumentRepository } from "./repository.js";
import { PrismaDocumentRepository } from "./prisma-repository.js";
import { getPrismaClient } from "@gamopls/db";
import { KeywordSearchProvider } from "./search.js";
import { buildApp } from "./build-app.js";
import type { DocumentRepository } from "./repository.js";

const databaseUrl = process.env.DATABASE_URL;
let repository: DocumentRepository;

if (databaseUrl) {
  console.log("hub: using Neon Postgres database via Prisma");
  const prisma = getPrismaClient();
  repository = new PrismaDocumentRepository(prisma);
} else {
  console.warn("DATABASE_URL not set — hub is running with an in-memory (non-persistent) store.");
  repository = new InMemoryDocumentRepository();
}

const storage = new LocalDiskStorageProvider(process.env.HUB_STORAGE_DIR ?? "./data/hub-documents");
const searchProvider = new KeywordSearchProvider(repository);

const app = buildApp({ repository, storage, searchProvider });
const port = Number(process.env.PORT ?? 4500);
const host = process.env.HOST ?? "0.0.0.0";

app
  .listen({ port, host })
  .then(() => {
    app.log.info(`hub listening on http://${host}:${port}`);
  })
  .catch((err) => {
    console.error("hub failed to start:", err);
    process.exit(1);
  });
