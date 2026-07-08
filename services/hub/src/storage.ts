import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Blob storage port (DIP). Only handles raw bytes, keyed by an id the
 * caller controls — it knows nothing about document metadata, org_id, or
 * fleet_id. Swappable for an S3/GCS-backed implementation later without
 * touching the repository or the routes.
 */
export interface StorageProvider {
  /** Persist `content` under `id` and return an opaque locator. */
  store(id: string, content: Buffer): Promise<string>;
  /** Fetch previously stored bytes by the locator `store` returned. */
  retrieve(location: string): Promise<Buffer>;
}

/**
 * V1 default: documents are written to a local directory on disk. Good
 * enough for a single-node Chennai pilot deployment; swap for an S3/GCS
 * `StorageProvider` when we outgrow a single box.
 */
export class LocalDiskStorageProvider implements StorageProvider {
  constructor(private readonly baseDir: string) {}

  async store(id: string, content: Buffer): Promise<string> {
    await mkdir(this.baseDir, { recursive: true });
    const location = join(this.baseDir, id);
    await writeFile(location, content);
    return location;
  }

  async retrieve(location: string): Promise<Buffer> {
    return readFile(location);
  }
}

/**
 * In-memory storage — used in tests (and as a lightweight default) so
 * document upload round-trips don't require touching disk.
 */
export class InMemoryStorageProvider implements StorageProvider {
  private readonly blobs = new Map<string, Buffer>();

  async store(id: string, content: Buffer): Promise<string> {
    const location = `mem://${id}`;
    this.blobs.set(location, content);
    return location;
  }

  async retrieve(location: string): Promise<Buffer> {
    const content = this.blobs.get(location);
    if (!content) {
      throw new Error(`no blob stored at ${location}`);
    }
    return content;
  }

  clear(): void {
    this.blobs.clear();
  }
}
