import type { DocumentMetadata } from "./schemas.js";

/**
 * Document metadata store port (DIP). Every read is scoped by
 * org_id/fleet_id per CLAUDE.md's multi-tenancy rule — there is no way
 * to fetch a document without supplying both, so "forgot to scope the
 * query" is not a shape this interface allows.
 */
export interface DocumentRepository {
  create(metadata: DocumentMetadata): Promise<DocumentMetadata>;
  findById(id: string, org_id: string, fleet_id: string): Promise<DocumentMetadata | undefined>;
  list(org_id: string, fleet_id: string): Promise<DocumentMetadata[]>;
}

/**
 * In-memory metadata store (V1 default, mirrors services/registry's
 * RegistryStore convention). No Postgres wiring yet for this service —
 * swap for a Postgres-backed implementation of `DocumentRepository` when
 * persistence across restarts is needed; routes/tests don't change.
 */
export class InMemoryDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, DocumentMetadata>();

  async create(metadata: DocumentMetadata): Promise<DocumentMetadata> {
    this.documents.set(metadata.id, metadata);
    return metadata;
  }

  async findById(id: string, org_id: string, fleet_id: string): Promise<DocumentMetadata | undefined> {
    const doc = this.documents.get(id);
    if (!doc || doc.org_id !== org_id || doc.fleet_id !== fleet_id) {
      return undefined;
    }
    return doc;
  }

  async list(org_id: string, fleet_id: string): Promise<DocumentMetadata[]> {
    return Array.from(this.documents.values()).filter(
      (doc) => doc.org_id === org_id && doc.fleet_id === fleet_id,
    );
  }

  clear(): void {
    this.documents.clear();
  }
}
