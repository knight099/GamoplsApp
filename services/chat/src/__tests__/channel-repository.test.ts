import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryChannelRepository } from "../repositories/in-memory-channel-repository.js";

describe("InMemoryChannelRepository", () => {
  let repo: InMemoryChannelRepository;

  beforeEach(() => {
    repo = new InMemoryChannelRepository();
  });

  it("creates then reads a channel back by id (round trip)", async () => {
    const created = await repo.create({
      org_id: "org-1",
      fleet_id: "fleet-1",
      mission_id: "mission-1",
      name: "Ops Channel",
    });

    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();

    const found = await repo.findById(created.id);
    expect(found).toMatchObject({
      org_id: "org-1",
      fleet_id: "fleet-1",
      mission_id: "mission-1",
      name: "Ops Channel",
    });
  });

  it("returns null for a missing channel", async () => {
    expect(await repo.findById("nope")).toBeNull();
  });

  it("lists channels scoped by mission", async () => {
    await repo.create({ org_id: "org-1", fleet_id: "fleet-1", mission_id: "mission-1", name: "A" });
    await repo.create({ org_id: "org-1", fleet_id: "fleet-1", mission_id: "mission-2", name: "B" });
    await repo.create({ org_id: "org-2", fleet_id: "fleet-9", mission_id: "mission-1", name: "C" });

    const result = await repo.listByMission("org-1", "mission-1");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "A" });
  });

  it("lists channels scoped by fleet, ordered by creation", async () => {
    await repo.create({ org_id: "org-1", fleet_id: "fleet-1", mission_id: "m1", name: "First" });
    await repo.create({ org_id: "org-1", fleet_id: "fleet-1", mission_id: "m2", name: "Second" });
    await repo.create({ org_id: "org-1", fleet_id: "fleet-2", mission_id: "m3", name: "Other fleet" });

    const result = await repo.listByFleet("org-1", "fleet-1");
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name)).toEqual(["First", "Second"]);
  });

  it("updates a channel's name", async () => {
    const created = await repo.create({ org_id: "org-1", fleet_id: "fleet-1", mission_id: "m1", name: "Old" });
    const updated = await repo.update(created.id, { name: "New" });
    expect(updated).toMatchObject({ name: "New" });
  });

  it("returns null when updating a missing channel", async () => {
    expect(await repo.update("nope", { name: "x" })).toBeNull();
  });

  it("deletes a channel", async () => {
    const created = await repo.create({ org_id: "org-1", fleet_id: "fleet-1", mission_id: "m1", name: "Gone" });
    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.findById(created.id)).toBeNull();
    expect(await repo.delete(created.id)).toBe(false);
  });
});
