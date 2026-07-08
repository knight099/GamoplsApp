import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryDocumentRepository } from "../repository.js";
import { KeywordSearchProvider } from "../search.js";
import type { DocumentMetadata } from "../schemas.js";

function makeDoc(overrides: Partial<DocumentMetadata> = {}): DocumentMetadata {
  return {
    id: "doc-1",
    org_id: "org-a",
    fleet_id: "fleet-1",
    filename: "manual.pdf",
    mimeType: "application/pdf",
    size: 1024,
    uploader: "user-1",
    tags: [],
    storageLocation: "mem://doc-1",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("KeywordSearchProvider", () => {
  let repo: InMemoryDocumentRepository;
  let provider: KeywordSearchProvider;

  beforeEach(() => {
    repo = new InMemoryDocumentRepository();
    provider = new KeywordSearchProvider(repo);
  });

  it("returns a sane result shape for a filename match", async () => {
    await repo.create(makeDoc({ id: "doc-1", filename: "vehicle-maintenance-guide.pdf" }));

    const results = await provider.search("maintenance", "org-a", "fleet-1");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      documentId: "doc-1",
      filename: "vehicle-maintenance-guide.pdf",
    });
    expect(typeof results[0]?.score).toBe("number");
    expect(typeof results[0]?.snippet).toBe("string");
  });

  it("matches on description and tags too", async () => {
    await repo.create(
      makeDoc({
        id: "doc-2",
        filename: "report.pdf",
        description: "Quarterly fuel efficiency report",
        tags: ["fuel", "quarterly"],
      }),
    );

    const byDescription = await provider.search("efficiency", "org-a", "fleet-1");
    expect(byDescription.map((r) => r.documentId)).toEqual(["doc-2"]);

    const byTag = await provider.search("fuel", "org-a", "fleet-1");
    expect(byTag.map((r) => r.documentId)).toEqual(["doc-2"]);
  });

  it("is case-insensitive", async () => {
    await repo.create(makeDoc({ id: "doc-1", filename: "Vehicle-Manual.PDF" }));
    const results = await provider.search("vehicle", "org-a", "fleet-1");
    expect(results).toHaveLength(1);
  });

  it("does not return documents from another org/fleet", async () => {
    await repo.create(makeDoc({ id: "doc-1", org_id: "org-b", fleet_id: "fleet-1", filename: "manual.pdf" }));
    const results = await provider.search("manual", "org-a", "fleet-1");
    expect(results).toEqual([]);
  });

  it("returns an empty array when nothing matches", async () => {
    await repo.create(makeDoc({ id: "doc-1", filename: "manual.pdf" }));
    const results = await provider.search("nonexistent-term", "org-a", "fleet-1");
    expect(results).toEqual([]);
  });

  it("ranks filename matches above description-only matches", async () => {
    await repo.create(makeDoc({ id: "doc-desc", filename: "report.pdf", description: "about safety" }));
    await repo.create(makeDoc({ id: "doc-name", filename: "safety-checklist.pdf" }));

    const results = await provider.search("safety", "org-a", "fleet-1");
    expect(results[0]?.documentId).toBe("doc-name");
  });
});
