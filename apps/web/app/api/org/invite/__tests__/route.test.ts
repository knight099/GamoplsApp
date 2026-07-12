import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { issueJwt, SESSION_COOKIE_NAME } from "@gamopls/auth";
import { createOrgInviteHandler } from "../handler.js";
import { InMemoryOrgRepository } from "@/lib/org-repository";

const SECRET = "test-secret";

function makeRequest(cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(new URL("http://web.local/api/org/invite"), { method: "POST", headers });
}

describe("POST /api/org/invite", () => {
  let orgRepo: InMemoryOrgRepository;

  beforeEach(() => {
    orgRepo = new InMemoryOrgRepository();
    process.env.JWT_SECRET = SECRET;
  });

  it("returns 403 for a fleet_manager", async () => {
    const org = await orgRepo.create("Acme");
    const token = await issueJwt({ user_id: "u1", org_id: org.id, fleet_id: "f1", role: "fleet_manager" }, { secret: SECRET });
    const handler = createOrgInviteHandler({ orgRepo });
    const res = await handler(makeRequest(token));
    expect(res.status).toBe(403);
  });

  it("regenerates the token for an owner, invalidating the old link", async () => {
    const org = await orgRepo.create("Acme");
    const oldToken = org.invite_token;
    const jwtToken = await issueJwt({ user_id: "u1", org_id: org.id, fleet_id: "f1", role: "owner" }, { secret: SECRET });

    const handler = createOrgInviteHandler({ orgRepo });
    const res = await handler(makeRequest(jwtToken));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.invite_link).not.toContain(oldToken);
    expect(await orgRepo.findByInviteToken(oldToken)).toBeNull();
  });
});
