import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryStorageProvider, LocalDiskStorageProvider } from "../storage.js";

describe("InMemoryStorageProvider", () => {
  it("round-trips stored content", async () => {
    const storage = new InMemoryStorageProvider();
    const content = Buffer.from("hello hub");

    const location = await storage.store("doc-1", content);
    const retrieved = await storage.retrieve(location);

    expect(retrieved.toString()).toBe("hello hub");
  });

  it("throws when retrieving an unknown location", async () => {
    const storage = new InMemoryStorageProvider();
    await expect(storage.retrieve("mem://nope")).rejects.toThrow();
  });
});

describe("LocalDiskStorageProvider", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "hub-storage-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes content to disk and round-trips it", async () => {
    const storage = new LocalDiskStorageProvider(dir);
    const content = Buffer.from("pilot document content");

    const location = await storage.store("doc-1", content);
    const onDisk = await readFile(location);
    expect(onDisk.toString()).toBe("pilot document content");

    const retrieved = await storage.retrieve(location);
    expect(retrieved.toString()).toBe("pilot document content");
  });
});
