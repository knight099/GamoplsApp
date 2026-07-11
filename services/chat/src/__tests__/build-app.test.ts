import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { SCOPE_HEADER_NAME, signScopeHeader } from "@gamopls/auth";
import { buildApp } from "../build-app.js";

const SCOPE_SECRET = "chat-test-secret";
const scopeHeaders = (org_id = "org-1", fleet_id = "fleet-1") => ({
  [SCOPE_HEADER_NAME]: signScopeHeader({ org_id, fleet_id }, { secret: SCOPE_SECRET }),
});

describe("chat app", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({ scopeSecret: SCOPE_SECRET });
  });

  async function createChannel(
    overrides: Record<string, unknown> = {},
    scope: { org?: string; fleet?: string } = {},
  ) {
    const response = await app.inject({
      method: "POST",
      url: "/channels",
      headers: scopeHeaders(scope.org ?? "org-1", scope.fleet ?? "fleet-1"),
      payload: {
        mission_id: "mission-1",
        name: "Ops Channel",
        ...overrides,
      },
    });
    return response.json();
  }

  describe("channel CRUD", () => {
    it("creates then fetches a channel by id (round trip)", async () => {
      const createResponse = await app.inject({
        method: "POST",
        url: "/channels",
        headers: scopeHeaders(),
        payload: { mission_id: "mission-1", name: "Ops Channel" },
      });
      expect(createResponse.statusCode).toBe(201);
      const created = createResponse.json();
      expect(created.id).toBeTruthy();
      expect(created).toMatchObject({ org_id: "org-1", fleet_id: "fleet-1" });

      const getResponse = await app.inject({
        method: "GET",
        url: `/channels/${created.id}`,
        headers: scopeHeaders(),
      });
      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.json()).toMatchObject({ name: "Ops Channel", mission_id: "mission-1" });
    });

    it("returns 400 for a malformed create payload", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/channels",
        headers: scopeHeaders(),
        payload: { name: "no mission" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("returns 404 for a missing channel", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/channels/does-not-exist",
        headers: scopeHeaders(),
      });
      expect(response.statusCode).toBe(404);
    });

    it("lists the caller org's channels, optionally filtered by mission_id", async () => {
      await createChannel({ mission_id: "m1", name: "A" });
      await createChannel({ mission_id: "m2", name: "B" });

      const all = await app.inject({ method: "GET", url: "/channels", headers: scopeHeaders() });
      expect(all.json().channels).toHaveLength(2);

      const filtered = await app.inject({
        method: "GET",
        url: "/channels?mission_id=m1",
        headers: scopeHeaders(),
      });
      expect(filtered.json().channels).toHaveLength(1);
      expect(filtered.json().channels[0]).toMatchObject({ name: "A" });
    });

    it("updates a channel's name", async () => {
      const created = await createChannel();
      const response = await app.inject({
        method: "PATCH",
        url: `/channels/${created.id}`,
        headers: scopeHeaders(),
        payload: { name: "Renamed" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ name: "Renamed" });
    });

    it("deletes a channel", async () => {
      const created = await createChannel();
      const del = await app.inject({
        method: "DELETE",
        url: `/channels/${created.id}`,
        headers: scopeHeaders(),
      });
      expect(del.statusCode).toBe(204);

      const get = await app.inject({
        method: "GET",
        url: `/channels/${created.id}`,
        headers: scopeHeaders(),
      });
      expect(get.statusCode).toBe(404);
    });
  });

  describe("message CRUD", () => {
    it("creates then lists a message within a channel (round trip), threading org_id/fleet_id from the channel", async () => {
      const channel = await createChannel();

      const createResponse = await app.inject({
        method: "POST",
        url: `/channels/${channel.id}/messages`,
        headers: scopeHeaders(),
        payload: { senderType: "user", senderId: "user-1", body: "hello team" },
      });
      expect(createResponse.statusCode).toBe(201);
      const message = createResponse.json();
      expect(message).toMatchObject({
        channelId: channel.id,
        org_id: "org-1",
        fleet_id: "fleet-1",
        senderType: "user",
        body: "hello team",
      });

      const listResponse = await app.inject({
        method: "GET",
        url: `/channels/${channel.id}/messages`,
        headers: scopeHeaders(),
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().messages).toHaveLength(1);
    });

    it("stores a media reference as pointer + metadata via the REST API", async () => {
      const channel = await createChannel();
      const response = await app.inject({
        method: "POST",
        url: `/channels/${channel.id}/messages`,
        headers: scopeHeaders(),
        payload: {
          senderId: "user-1",
          body: "photo attached",
          media: { url: "https://cdn.example.com/x.png", filename: "x.png", mimeType: "image/png", size: 2048 },
        },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().media).toEqual({
        url: "https://cdn.example.com/x.png",
        filename: "x.png",
        mimeType: "image/png",
        size: 2048,
      });
    });

    it("returns 404 when posting a message to a missing channel", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/channels/does-not-exist/messages",
        headers: scopeHeaders(),
        payload: { senderId: "user-1", body: "hi" },
      });
      expect(response.statusCode).toBe(404);
    });

    it("returns 400 for a malformed message payload", async () => {
      const channel = await createChannel();
      const response = await app.inject({
        method: "POST",
        url: `/channels/${channel.id}/messages`,
        headers: scopeHeaders(),
        payload: { senderId: "user-1" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("updates and deletes a message", async () => {
      const channel = await createChannel();
      const created = (
        await app.inject({
          method: "POST",
          url: `/channels/${channel.id}/messages`,
          headers: scopeHeaders(),
          payload: { senderId: "user-1", body: "original" },
        })
      ).json();

      const updateResponse = await app.inject({
        method: "PATCH",
        url: `/messages/${created.id}`,
        headers: scopeHeaders(),
        payload: { body: "edited" },
      });
      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json()).toMatchObject({ body: "edited" });

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/messages/${created.id}`,
        headers: scopeHeaders(),
      });
      expect(deleteResponse.statusCode).toBe(204);

      const getResponse = await app.inject({
        method: "GET",
        url: `/messages/${created.id}`,
        headers: scopeHeaders(),
      });
      expect(getResponse.statusCode).toBe(404);
    });
  });

  describe("tenant scope enforcement (S-1, chat IDOR)", () => {
    it("401s every channel/message route without a scope header", async () => {
      for (const [method, url] of [
        ["POST", "/channels"],
        ["GET", "/channels"],
        ["GET", "/channels/c1"],
        ["PATCH", "/channels/c1"],
        ["DELETE", "/channels/c1"],
        ["POST", "/channels/c1/messages"],
        ["GET", "/channels/c1/messages"],
        ["GET", "/messages/m1"],
        ["PATCH", "/messages/m1"],
        ["DELETE", "/messages/m1"],
      ] as const) {
        const res = await app.inject({ method, url, payload: {} });
        expect(res.statusCode, `${method} ${url}`).toBe(401);
      }
    });

    it("creates channels in the header scope, ignoring spoofed body tenancy", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/channels",
        headers: scopeHeaders("org-1", "fleet-1"),
        payload: { mission_id: "m-1", name: "Ops", org_id: "org-EVIL", fleet_id: "fleet-EVIL" },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ org_id: "org-1", fleet_id: "fleet-1" });
    });

    it("hides another org's channel and its messages behind 404", async () => {
      const channel = await createChannel();
      for (const [method, url, payload] of [
        ["GET", `/channels/${channel.id}`, undefined],
        ["PATCH", `/channels/${channel.id}`, { name: "hijack" }],
        ["DELETE", `/channels/${channel.id}`, undefined],
        ["GET", `/channels/${channel.id}/messages`, undefined],
        ["POST", `/channels/${channel.id}/messages`, { senderId: "u", body: "hi" }],
      ] as const) {
        const res = await app.inject({
          method,
          url,
          payload,
          headers: scopeHeaders("org-2", "fleet-2"),
        });
        expect(res.statusCode, `${method} ${url}`).toBe(404);
      }
    });

    it("hides another org's message behind 404 on by-id message routes", async () => {
      const channel = await createChannel();
      const msg = await app.inject({
        method: "POST",
        url: `/channels/${channel.id}/messages`,
        headers: scopeHeaders("org-1", "fleet-1"),
        payload: { senderId: "u1", body: "secret" },
      });
      const id = msg.json().id;
      for (const [method, url, payload] of [
        ["GET", `/messages/${id}`, undefined],
        ["PATCH", `/messages/${id}`, { body: "tampered" }],
        ["DELETE", `/messages/${id}`, undefined],
      ] as const) {
        const res = await app.inject({
          method,
          url,
          payload,
          headers: scopeHeaders("org-2", "fleet-2"),
        });
        expect(res.statusCode, `${method} ${url}`).toBe(404);
      }
    });

    it("lists only the caller org's channels regardless of query params", async () => {
      await createChannel();
      const res = await app.inject({
        method: "GET",
        url: "/channels?org_id=org-1",
        headers: scopeHeaders("org-2", "fleet-2"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().channels).toEqual([]);
    });
  });
});
