import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryDocumentRepository } from "../repository.js";
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

describe("InMemoryDocumentRepository", () => {
  let repo: InMemoryDocumentRepository;

  beforeEach(() => {
    repo = new InMemoryDocumentRepository();
  });

  it("round-trips a created document via findById", async () => {
    const doc = makeDoc();
    await repo.create(doc);

    const found = await repo.findById(doc.id, doc.org_id, doc.fleet_id);
    expect(found).toEqual(doc);
  });

  it("lists documents scoped to org_id/fleet_id", async () => {
    await repo.create(makeDoc({ id: "doc-1", org_id: "org-a", fleet_id: "fleet-1" }));
    await repo.create(makeDoc({ id: "doc-2", org_id: "org-a", fleet_id: "fleet-1" }));
    await repo.create(makeDoc({ id: "doc-3", org_id: "org-a", fleet_id: "fleet-2" }));

    const list = await repo.list("org-a", "fleet-1");
    expect(list.map((d) => d.id).sort()).toEqual(["doc-1", "doc-2"]);
  });

  it("never returns a document from another org via findById", async () => {
    const doc = makeDoc({ id: "doc-1", org_id: "org-a", fleet_id: "fleet-1" });
    await repo.create(doc);

    const found = await repo.findById("doc-1", "org-b", "fleet-1");
    expect(found).toBeUndefined();
  });

  it("never returns a document from another fleet via findById", async () => {
    const doc = makeDoc({ id: "doc-1", org_id: "org-a", fleet_id: "fleet-1" });
    await repo.create(doc);

    const found = await repo.findById("doc-1", "org-a", "fleet-2");
    expect(found).toBeUndefined();
  });

  it("never leaks another org's documents into list()", async () => {
    await repo.create(makeDoc({ id: "doc-1", org_id: "org-a", fleet_id: "fleet-1" }));
    await repo.create(makeDoc({ id: "doc-2", org_id: "org-b", fleet_id: "fleet-1" }));

    const listA = await repo.list("org-a", "fleet-1");
    const listB = await repo.list("org-b", "fleet-1");

    expect(listA.map((d) => d.id)).toEqual(["doc-1"]);
    expect(listB.map((d) => d.id)).toEqual(["doc-2"]);
  });

  it("returns an empty list for an unknown org/fleet", async () => {
    const list = await repo.list("no-such-org", "no-such-fleet");
    expect(list).toEqual([]);
  });
});
