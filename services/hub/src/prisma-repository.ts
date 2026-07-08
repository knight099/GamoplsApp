import type { PrismaClient } from "@gamopls/db";
import type { DocumentRepository } from "./repository.js";
import type { DocumentMetadata } from "./schemas.js";

export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapDocument(dbDoc: any): DocumentMetadata {
    const doc: DocumentMetadata = {
      id: dbDoc.id,
      org_id: dbDoc.org_id,
      fleet_id: dbDoc.fleet_id,
      filename: dbDoc.filename,
      mimeType: dbDoc.mime_type,
      size: dbDoc.size,
      uploader: dbDoc.uploader,
      tags: dbDoc.tags,
      storageLocation: dbDoc.storage_location,
      createdAt: dbDoc.created_at.toISOString(),
    };

    if (dbDoc.description) {
      doc.description = dbDoc.description;
    }

    return doc;
  }

  async create(metadata: DocumentMetadata): Promise<DocumentMetadata> {
    const dbDoc = await this.prisma.document.create({
      data: {
        id: metadata.id, // Keep the generated UUID from service
        org_id: metadata.org_id,
        fleet_id: metadata.fleet_id,
        filename: metadata.filename,
        mime_type: metadata.mimeType,
        size: metadata.size,
        uploader: metadata.uploader,
        description: metadata.description ?? null,
        tags: metadata.tags,
        storage_location: metadata.storageLocation,
      },
    });
    return this.mapDocument(dbDoc);
  }

  async findById(id: string, org_id: string, fleet_id: string): Promise<DocumentMetadata | undefined> {
    try {
      const dbDoc = await this.prisma.document.findFirst({
        where: { id, org_id, fleet_id },
      });
      return dbDoc ? this.mapDocument(dbDoc) : undefined;
    } catch {
      return undefined;
    }
  }

  async list(org_id: string, fleet_id: string): Promise<DocumentMetadata[]> {
    const dbDocs = await this.prisma.document.findMany({
      where: { org_id, fleet_id },
      orderBy: { created_at: "desc" },
    });
    return dbDocs.map((d) => this.mapDocument(d));
  }
}
