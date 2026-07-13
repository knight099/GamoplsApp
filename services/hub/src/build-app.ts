import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import type { DocumentRepository } from "./repository.js";
import { InMemoryDocumentRepository } from "./repository.js";
import {
  listDocumentsQuerySchema,
  searchQuerySchema,
  uploadDocumentQuerySchema,
  uploadDocumentRequestSchema,
  type DocumentMetadata,
} from "./schemas.js";
import type { SearchProvider } from "./search.js";
import { KeywordSearchProvider } from "./search.js";
import type { StorageProvider } from "./storage.js";
import { InMemoryStorageProvider } from "./storage.js";

export interface BuildAppOptions {
  repository?: DocumentRepository;
  storage?: StorageProvider;
  searchProvider?: SearchProvider;
}

/**
 * Registers the hub routes directly onto an existing Fastify instance —
 * the standalone-server path (`buildApp`) and the combined backend
 * (`services/backend`) both call this, so route logic lives in one
 * place regardless of how many processes are running. Storage/repository
 * /search providers are swappable at the call site for tests.
 */
export function registerHubRoutes(app: FastifyInstance, options: BuildAppOptions = {}): void {
  const repository = options.repository ?? new InMemoryDocumentRepository();
  const storage = options.storage ?? new InMemoryStorageProvider();
  const searchProvider = options.searchProvider ?? new KeywordSearchProvider(repository);

  app.post("/documents", async (request, reply) => {
    // Tenant scope comes from query params (forced by the gateway from the
    // verified JWT), never from the JSON body — see the note on
    // uploadDocumentRequestSchema for why.
    const parsedQuery = uploadDocumentQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "org_id and fleet_id query params are required",
        details: parsedQuery.error.flatten(),
      });
    }

    const parsed = uploadDocumentRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid document upload payload",
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;
    const { org_id, fleet_id } = parsedQuery.data;
    const id = randomUUID();

    let storageLocation: string;
    let size: number;
    if (input.content) {
      const buffer = Buffer.from(input.content, "base64");
      storageLocation = await storage.store(id, buffer);
      size = buffer.byteLength;
    } else {
      // blobUrl case: the file already lives in external storage, hub
      // just records the pointer. Size is unknown without fetching the
      // blob, which we deliberately don't do on the upload hot path.
      storageLocation = input.blobUrl as string;
      size = 0;
    }

    const metadata: DocumentMetadata = {
      id,
      org_id,
      fleet_id,
      filename: input.filename,
      mimeType: input.mimeType,
      size,
      uploader: input.uploader,
      description: input.description,
      tags: input.tags ?? [],
      storageLocation,
      createdAt: new Date().toISOString(),
    };

    const created = await repository.create(metadata);
    return reply.status(201).send(created);
  });

  app.get("/documents", async (request, reply) => {
    const parsed = listDocumentsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "org_id and fleet_id query params are required",
        details: parsed.error.flatten(),
      });
    }

    const documents = await repository.list(parsed.data.org_id, parsed.data.fleet_id);
    return reply.status(200).send({ documents });
  });

  app.get("/documents/:id", async (request, reply) => {
    const parsedQuery = listDocumentsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({
        error: "org_id and fleet_id query params are required",
        details: parsedQuery.error.flatten(),
      });
    }

    const { id } = request.params as { id: string };
    const document = await repository.findById(id, parsedQuery.data.org_id, parsedQuery.data.fleet_id);
    if (!document) {
      return reply.status(404).send({ error: "document not found" });
    }

    return reply.status(200).send(document);
  });

  app.get("/search", async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "q, org_id and fleet_id query params are required",
        details: parsed.error.flatten(),
      });
    }

    const results = await searchProvider.search(parsed.data.q, parsed.data.org_id, parsed.data.fleet_id);
    return reply.status(200).send({ results });
  });
}

/**
 * Builds (but does not start listening) a standalone Fastify app for the
 * hub (document/knowledge base) service. Kept separate from server.ts so
 * tests can use Fastify's `inject()` without binding a real port.
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  registerHubRoutes(app, options);
  return app;
}
