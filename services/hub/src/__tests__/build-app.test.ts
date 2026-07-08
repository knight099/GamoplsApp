import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../build-app.js";
import { InMemoryDocumentRepository } from "../repository.js";
import { InMemoryStorageProvider } from "../storage.js";
import { KeywordSearchProvider } from "../search.js";

function makeApp(): FastifyInstance {
  const repository = new InMemoryDocumentRepository();
  const storage = new InMemoryStorageProvider();
  const searchProvider = new KeywordSearchProvider(repository);
  return buildApp({ repository, storage, searchProvider });
}

describe("hub app", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = makeApp();
  });

  it("uploads a document then fetches it by id (round trip)", async () => {
    const content = Buffer.from("engine service manual contents").toString("base64");

    const uploadResponse = await app.inject({
      method: "POST",
      url: "/documents?org_id=org-a&fleet_id=fleet-1",
      payload: {
        filename: "engine-service-manual.pdf",
        mimeType: "application/pdf",
        uploader: "user-1",
        description: "Engine service manual",
        tags: ["engine", "manual"],
        content,
      },
    });

    expect(uploadResponse.statusCode).toBe(201);
    const uploaded = uploadResponse.json();
    expect(uploaded).toMatchObject({
      org_id: "org-a",
      fleet_id: "fleet-1",
      filename: "engine-service-manual.pdf",
      mimeType: "application/pdf",
      uploader: "user-1",
      description: "Engine service manual",
      tags: ["engine", "manual"],
    });
    expect(uploaded.id).toBeTruthy();
    expect(uploaded.size).toBeGreaterThan(0);
    expect(uploaded.createdAt).toBeTruthy();

    const getResponse = await app.inject({
      method: "GET",
      url: `/documents/${uploaded.id}?org_id=org-a&fleet_id=fleet-1`,
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual(uploaded);
  });

  it("ignores an org_id/fleet_id in the body and uses the query-scoped tenant instead", async () => {
    // Regression test: the gateway only forces org_id/fleet_id as query
    // params, never in the JSON body, so a client-supplied body org_id
    // must never win — it isn't even part of the schema anymore.
    const uploadResponse = await app.inject({
      method: "POST",
      url: "/documents?org_id=org-a&fleet_id=fleet-1",
      payload: {
        // @ts-expect-error -- deliberately sending a field the schema no longer accepts
        org_id: "org-attacker",
        fleet_id: "fleet-attacker",
        filename: "spoofed.pdf",
        mimeType: "application/pdf",
        uploader: "user-1",
        content: Buffer.from("x").toString("base64"),
      },
    });

    expect(uploadResponse.statusCode).toBe(201);
    expect(uploadResponse.json()).toMatchObject({ org_id: "org-a", fleet_id: "fleet-1" });
  });

  it("rejects an upload missing org_id/fleet_id query params", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/documents",
      payload: {
        filename: "no-scope.pdf",
        mimeType: "application/pdf",
        uploader: "user-1",
        content: Buffer.from("x").toString("base64"),
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("accepts a blobUrl upload without content", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/documents?org_id=org-a&fleet_id=fleet-1",
      payload: {
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        uploader: "user-1",
        blobUrl: "https://blob.example.com/photo.jpg",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.storageLocation).toBe("https://blob.example.com/photo.jpg");
  });

  it("rejects an upload with neither content nor blobUrl", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/documents?org_id=org-a&fleet_id=fleet-1",
      payload: {
        filename: "empty.pdf",
        mimeType: "application/pdf",
        uploader: "user-1",
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects an upload with both content and blobUrl", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/documents?org_id=org-a&fleet_id=fleet-1",
      payload: {
        filename: "both.pdf",
        mimeType: "application/pdf",
        uploader: "user-1",
        content: Buffer.from("x").toString("base64"),
        blobUrl: "https://blob.example.com/both.pdf",
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects an upload missing required fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/documents?org_id=org-a&fleet_id=fleet-1",
      payload: { filename: "no-org.pdf" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns 404 for a document that does not exist", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/documents/does-not-exist?org_id=org-a&fleet_id=fleet-1",
    });
    expect(response.statusCode).toBe(404);
  });

  it("scopes GET /documents/:id by org_id — org B can never fetch org A's document", async () => {
    const uploadResponse = await app.inject({
      method: "POST",
      url: "/documents?org_id=org-a&fleet_id=fleet-1",
      payload: {
        filename: "confidential.pdf",
        mimeType: "application/pdf",
        uploader: "user-1",
        content: Buffer.from("secret").toString("base64"),
      },
    });
    const { id } = uploadResponse.json();

    const crossOrgResponse = await app.inject({
      method: "GET",
      url: `/documents/${id}?org_id=org-b&fleet_id=fleet-1`,
    });
    expect(crossOrgResponse.statusCode).toBe(404);
  });

  it("requires org_id and fleet_id query params on GET /documents/:id", async () => {
    const response = await app.inject({ method: "GET", url: "/documents/some-id" });
    expect(response.statusCode).toBe(400);
  });

  it("lists documents scoped by org_id/fleet_id — org B never sees org A's documents", async () => {
    await app.inject({
      method: "POST",
      url: "/documents?org_id=org-a&fleet_id=fleet-1",
      payload: {
        filename: "a.pdf",
        mimeType: "application/pdf",
        uploader: "user-1",
        content: Buffer.from("a").toString("base64"),
      },
    });
    await app.inject({
      method: "POST",
      url: "/documents?org_id=org-b&fleet_id=fleet-1",
      payload: {
        filename: "b.pdf",
        mimeType: "application/pdf",
        uploader: "user-2",
        content: Buffer.from("b").toString("base64"),
      },
    });

    const listA = await app.inject({ method: "GET", url: "/documents?org_id=org-a&fleet_id=fleet-1" });
    expect(listA.statusCode).toBe(200);
    const bodyA = listA.json();
    expect(bodyA.documents).toHaveLength(1);
    expect(bodyA.documents[0].filename).toBe("a.pdf");

    const listB = await app.inject({ method: "GET", url: "/documents?org_id=org-b&fleet_id=fleet-1" });
    const bodyB = listB.json();
    expect(bodyB.documents).toHaveLength(1);
    expect(bodyB.documents[0].filename).toBe("b.pdf");
  });

  it("requires org_id and fleet_id query params on GET /documents", async () => {
    const response = await app.inject({ method: "GET", url: "/documents" });
    expect(response.statusCode).toBe(400);
  });

  it("searches uploaded documents via GET /search", async () => {
    await app.inject({
      method: "POST",
      url: "/documents?org_id=org-a&fleet_id=fleet-1",
      payload: {
        filename: "geofence-policy.pdf",
        mimeType: "application/pdf",
        uploader: "user-1",
        content: Buffer.from("policy").toString("base64"),
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/search?q=geofence&org_id=org-a&fleet_id=fleet-1",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ filename: "geofence-policy.pdf" });
    expect(typeof body.results[0].score).toBe("number");
  });

  it("returns an empty results array for a query with no matches", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/search?q=nonexistent&org_id=org-a&fleet_id=fleet-1",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ results: [] });
  });

  it("requires q, org_id, and fleet_id on GET /search", async () => {
    const response = await app.inject({ method: "GET", url: "/search?org_id=org-a&fleet_id=fleet-1" });
    expect(response.statusCode).toBe(400);
  });

  it("search never returns another org's documents", async () => {
    await app.inject({
      method: "POST",
      url: "/documents?org_id=org-b&fleet_id=fleet-1",
      payload: {
        filename: "geofence-policy.pdf",
        mimeType: "application/pdf",
        uploader: "user-1",
        content: Buffer.from("policy").toString("base64"),
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/search?q=geofence&org_id=org-a&fleet_id=fleet-1",
    });
    expect(response.json()).toEqual({ results: [] });
  });
});
