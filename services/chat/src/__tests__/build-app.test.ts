import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../build-app.js";

describe("chat app", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp();
  });

  async function createChannel(overrides: Record<string, unknown> = {}) {
    const response = await app.inject({
      method: "POST",
      url: "/channels",
      payload: {
        org_id: "org-1",
        fleet_id: "fleet-1",
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
        payload: { org_id: "org-1", fleet_id: "fleet-1", mission_id: "mission-1", name: "Ops Channel" },
      });
      expect(createResponse.statusCode).toBe(201);
      const created = createResponse.json();
      expect(created.id).toBeTruthy();

      const getResponse = await app.inject({ method: "GET", url: `/channels/${created.id}` });
      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.json()).toMatchObject({ name: "Ops Channel", mission_id: "mission-1" });
    });

    it("returns 400 for a malformed create payload", async () => {
      const response = await app.inject({ method: "POST", url: "/channels", payload: { name: "no org" } });
      expect(response.statusCode).toBe(400);
    });

    it("returns 404 for a missing channel", async () => {
      const response = await app.inject({ method: "GET", url: "/channels/does-not-exist" });
      expect(response.statusCode).toBe(404);
    });

    it("lists channels for an org, optionally filtered by mission_id", async () => {
      await createChannel({ mission_id: "m1", name: "A" });
      await createChannel({ mission_id: "m2", name: "B" });

      const all = await app.inject({ method: "GET", url: "/channels?org_id=org-1" });
      expect(all.json().channels).toHaveLength(2);

      const filtered = await app.inject({ method: "GET", url: "/channels?org_id=org-1&mission_id=m1" });
      expect(filtered.json().channels).toHaveLength(1);
      expect(filtered.json().channels[0]).toMatchObject({ name: "A" });
    });

    it("requires org_id query param when listing", async () => {
      const response = await app.inject({ method: "GET", url: "/channels" });
      expect(response.statusCode).toBe(400);
    });

    it("updates a channel's name", async () => {
      const created = await createChannel();
      const response = await app.inject({
        method: "PATCH",
        url: `/channels/${created.id}`,
        payload: { name: "Renamed" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ name: "Renamed" });
    });

    it("deletes a channel", async () => {
      const created = await createChannel();
      const del = await app.inject({ method: "DELETE", url: `/channels/${created.id}` });
      expect(del.statusCode).toBe(204);

      const get = await app.inject({ method: "GET", url: `/channels/${created.id}` });
      expect(get.statusCode).toBe(404);
    });
  });

  describe("message CRUD", () => {
    it("creates then lists a message within a channel (round trip), threading org_id/fleet_id from the channel", async () => {
      const channel = await createChannel();

      const createResponse = await app.inject({
        method: "POST",
        url: `/channels/${channel.id}/messages`,
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

      const listResponse = await app.inject({ method: "GET", url: `/channels/${channel.id}/messages` });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().messages).toHaveLength(1);
    });

    it("stores a media reference as pointer + metadata via the REST API", async () => {
      const channel = await createChannel();
      const response = await app.inject({
        method: "POST",
        url: `/channels/${channel.id}/messages`,
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
        payload: { senderId: "user-1", body: "hi" },
      });
      expect(response.statusCode).toBe(404);
    });

    it("returns 400 for a malformed message payload", async () => {
      const channel = await createChannel();
      const response = await app.inject({
        method: "POST",
        url: `/channels/${channel.id}/messages`,
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
          payload: { senderId: "user-1", body: "original" },
        })
      ).json();

      const updateResponse = await app.inject({
        method: "PATCH",
        url: `/messages/${created.id}`,
        payload: { body: "edited" },
      });
      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json()).toMatchObject({ body: "edited" });

      const deleteResponse = await app.inject({ method: "DELETE", url: `/messages/${created.id}` });
      expect(deleteResponse.statusCode).toBe(204);

      const getResponse = await app.inject({ method: "GET", url: `/messages/${created.id}` });
      expect(getResponse.statusCode).toBe(404);
    });
  });
});
