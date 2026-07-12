import { describe, expect, it } from "vitest";
import { InMemoryUserRepository } from "../user-repository.js";

describe("InMemoryUserRepository", () => {
  it("creates a user and finds it by email", async () => {
    const repo = new InMemoryUserRepository();
    const user = await repo.create({
      org_id: "org-1",
      email: "user@example.com",
      password_hash: "hash",
      name: "Test User",
      role: "owner",
      last_fleet_id: "fleet-1",
    });
    expect(user.id).toBeTruthy();
    expect(await repo.findByEmail("user@example.com")).toEqual(user);
    expect(await repo.findByEmail("nobody@example.com")).toBeNull();
  });

  it("lists users scoped to one org", async () => {
    const repo = new InMemoryUserRepository();
    await repo.create({ org_id: "org-1", email: "a@example.com", password_hash: "h", name: "A", role: "owner", last_fleet_id: "fleet-1" });
    await repo.create({ org_id: "org-2", email: "b@example.com", password_hash: "h", name: "B", role: "owner", last_fleet_id: "fleet-2" });

    const orgOneUsers = await repo.listByOrg("org-1");
    expect(orgOneUsers).toHaveLength(1);
    expect(orgOneUsers[0].email).toBe("a@example.com");
  });

  it("updates last_fleet_id", async () => {
    const repo = new InMemoryUserRepository();
    const user = await repo.create({ org_id: "org-1", email: "a@example.com", password_hash: "h", name: "A", role: "owner", last_fleet_id: "fleet-1" });
    await repo.updateLastFleetId(user.id, "fleet-2");
    expect((await repo.findByEmail("a@example.com"))?.last_fleet_id).toBe("fleet-2");
  });

  it("seed() inserts a record directly, bypassing create()'s required last_fleet_id", async () => {
    const repo = new InMemoryUserRepository();
    repo.seed({
      id: "user-1", org_id: "org-1", email: "legacy@example.com", password_hash: "h",
      name: "Legacy", role: "owner", last_fleet_id: null, created_at: new Date().toISOString(),
    });
    expect((await repo.findByEmail("legacy@example.com"))?.last_fleet_id).toBeNull();
  });
});
