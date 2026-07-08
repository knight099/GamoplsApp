import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryMessageRepository } from "../repositories/in-memory-message-repository.js";

describe("InMemoryMessageRepository", () => {
  let repo: InMemoryMessageRepository;

  beforeEach(() => {
    repo = new InMemoryMessageRepository();
  });

  it("creates then reads a message back by id (round trip)", async () => {
    const created = await repo.create({
      channelId: "channel-1",
      org_id: "org-1",
      fleet_id: "fleet-1",
      senderType: "user",
      senderId: "user-1",
      body: "hello",
    });

    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();

    const found = await repo.findById(created.id);
    expect(found).toMatchObject({ body: "hello", senderType: "user" });
  });

  it("stores a media reference as pointer + metadata only, never a blob field", async () => {
    const created = await repo.create({
      channelId: "channel-1",
      org_id: "org-1",
      fleet_id: "fleet-1",
      senderType: "user",
      senderId: "user-1",
      body: "see attached",
      media: { url: "https://cdn.example.com/f.jpg", filename: "f.jpg", mimeType: "image/jpeg", size: 1024 },
    });

    expect(created.media).toEqual({
      url: "https://cdn.example.com/f.jpg",
      filename: "f.jpg",
      mimeType: "image/jpeg",
      size: 1024,
    });
    // No blob-shaped field exists on the type at all — this is enforced at
    // compile time by ChatMessage/MediaReference, not re-asserted here.
  });

  it("lists messages scoped to a channel, in creation order", async () => {
    await repo.create({ channelId: "c1", org_id: "org-1", fleet_id: "fleet-1", senderType: "user", senderId: "u1", body: "first" });
    await repo.create({ channelId: "c1", org_id: "org-1", fleet_id: "fleet-1", senderType: "user", senderId: "u1", body: "second" });
    await repo.create({ channelId: "c2", org_id: "org-1", fleet_id: "fleet-1", senderType: "user", senderId: "u1", body: "other channel" });

    const result = await repo.listByChannel("c1");
    expect(result.map((m) => m.body)).toEqual(["first", "second"]);
  });

  it("updates a message body", async () => {
    const created = await repo.create({ channelId: "c1", org_id: "org-1", fleet_id: "fleet-1", senderType: "user", senderId: "u1", body: "old" });
    const updated = await repo.update(created.id, { body: "new" });
    expect(updated).toMatchObject({ body: "new" });
  });

  it("deletes a message", async () => {
    const created = await repo.create({ channelId: "c1", org_id: "org-1", fleet_id: "fleet-1", senderType: "user", senderId: "u1", body: "gone" });
    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.findById(created.id)).toBeNull();
  });
});
