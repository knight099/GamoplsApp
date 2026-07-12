import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { issueJwt, SESSION_COOKIE_NAME } from "@gamopls/auth";
import { createOrgHandler } from "../route.js";
import { InMemoryOrgRepository } from "@/lib/org-repository";
import { InMemoryUserRepository } from "@/lib/user-repository";

const SECRET = "test-secret";

function makeRequest(cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(new URL("http://web.local/api/org"), { headers });
}

describe("GET /api/org", () => {
  let orgRepo: InMemoryOrgRepository;
  let userRepo: InMemoryUserRepository;

  beforeEach(() => {
    orgRepo = new InMemoryOrgRepository();
    userRepo = new InMemoryUserRepository();
    process.env.JWT_SECRET = SECRET;
  });

  it("returns 401 without a session", async () => {
    const handler = createOrgHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a fleet_manager", async () => {
    const org = await orgRepo.create("Acme");
    const token = await issueJwt({ user_id: "u1", org_id: org.id, fleet_id: "f1", role: "fleet_manager" }, { secret: SECRET });
    const handler = createOrgHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest(token));
    expect(res.status).toBe(403);
  });

  it("returns org info + invite link + members for an owner", async () => {
    const org = await orgRepo.create("Acme");
    await userRepo.create({ org_id: org.id, email: "owner@example.com", password_hash: "h", name: "Owner", role: "owner", last_fleet_id: "f1" });
    await userRepo.create({ org_id: org.id, email: "teammate@example.com", password_hash: "h", name: "Teammate", role: "fleet_manager", last_fleet_id: "f1" });

    const token = await issueJwt({ user_id: "u1", org_id: org.id, fleet_id: "f1", role: "owner" }, { secret: SECRET });
    const handler = createOrgHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest(token));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.name).toBe("Acme");
    expect(body.invite_link).toContain(org.invite_token);
    expect(body.members).toHaveLength(2);
    expect(body.members.map((m: { email: string }) => m.email).sort()).toEqual(["owner@example.com", "teammate@example.com"]);
  });
});
