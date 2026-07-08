import { LocalDiskStorageProvider } from "./storage.js";
import { InMemoryDocumentRepository } from "./repository.js";
import { KeywordSearchProvider } from "./search.js";
import { buildApp } from "./build-app.js";

const repository = new InMemoryDocumentRepository();
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
