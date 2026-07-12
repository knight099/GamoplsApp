import { describe, expect, it } from "vitest";
import { InMemoryOrgRepository } from "../org-repository.js";

describe("InMemoryOrgRepository", () => {
  it("creates an org with a unique invite token", async () => {
    const repo = new InMemoryOrgRepository();
    const a = await repo.create("Org A");
    const b = await repo.create("Org B");
    expect(a.name).toBe("Org A");
    expect(a.invite_token).not.toBe(b.invite_token);
  });

  it("finds an org by id", async () => {
    const repo = new InMemoryOrgRepository();
    const org = await repo.create("Org A");
    expect(await repo.findById(org.id)).toEqual(org);
    expect(await repo.findById("does-not-exist")).toBeNull();
  });

  it("finds an org by invite token", async () => {
    const repo = new InMemoryOrgRepository();
    const org = await repo.create("Org A");
    expect(await repo.findByInviteToken(org.invite_token)).toEqual(org);
    expect(await repo.findByInviteToken("bogus-token")).toBeNull();
  });

  it("regenerating the invite token invalidates the old one", async () => {
    const repo = new InMemoryOrgRepository();
    const org = await repo.create("Org A");
    const oldToken = org.invite_token;
    const newToken = await repo.regenerateInviteToken(org.id);

    expect(newToken).not.toBe(oldToken);
    expect(await repo.findByInviteToken(oldToken)).toBeNull();
    expect(await repo.findByInviteToken(newToken)).not.toBeNull();
  });

  it("delete removes the org", async () => {
    const repo = new InMemoryOrgRepository();
    const org = await repo.create("Org A");
    await repo.delete(org.id);
    expect(await repo.findById(org.id)).toBeNull();
  });
});
