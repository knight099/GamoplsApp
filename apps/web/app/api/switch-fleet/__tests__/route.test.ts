import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { issueJwt, SESSION_COOKIE_NAME, verifyJwt } from "@gamopls/auth";
import { createSwitchFleetHandler } from "../handler.js";
import { InMemoryUserRepository } from "@/lib/user-repository";
import * as fleetServiceClient from "@/lib/fleet-service-client";

vi.mock("@/lib/fleet-service-client");

const SECRET = "test-secret";

function makeRequest(body: unknown, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(new URL("http://web.local/api/switch-fleet"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/switch-fleet", () => {
  let userRepo: InMemoryUserRepository;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    process.env.JWT_SECRET = SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 without a session cookie", async () => {
    const handler = createSwitchFleetHandler({ userRepo });
    const res = await handler(makeRequest({ fleet_id: "fleet-2" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 without a fleet_id in the body", async () => {
    const token = await issueJwt({ user_id: "u1", org_id: "org-1", fleet_id: "fleet-1", role: "owner" }, { secret: SECRET });
    const handler = createSwitchFleetHandler({ userRepo });
    const res = await handler(makeRequest({}, token));
    expect(res.status).toBe(400);
  });

  it("returns 403 when the target fleet doesn't belong to the caller's org", async () => {
    vi.mocked(fleetServiceClient.listOrgFleets).mockResolvedValue([
      { id: "fleet-1", org_id: "org-1", name: "Main Fleet", created_at: new Date().toISOString() },
    ]);
    const token = await issueJwt({ user_id: "user-1", org_id: "org-1", fleet_id: "fleet-1", role: "owner" }, { secret: SECRET });
    const handler = createSwitchFleetHandler({ userRepo });
    const res = await handler(makeRequest({ fleet_id: "fleet-OTHER" }, token));
    expect(res.status).toBe(403);
  });

  it("switches fleets, persists last_fleet_id, and re-issues the session", async () => {
    vi.mocked(fleetServiceClient.listOrgFleets).mockResolvedValue([
      { id: "fleet-1", org_id: "org-1", name: "Main Fleet", created_at: new Date().toISOString() },
      { id: "fleet-2", org_id: "org-1", name: "Second Fleet", created_at: new Date().toISOString() },
    ]);
    const user = await userRepo.create({
      org_id: "org-1", email: "user@example.com", password_hash: "hash",
      name: "Test User", role: "owner", last_fleet_id: "fleet-1",
    });
    const token = await issueJwt({ user_id: user.id, org_id: "org-1", fleet_id: "fleet-1", role: "owner" }, { secret: SECRET });

    const handler = createSwitchFleetHandler({ userRepo });
    const res = await handler(makeRequest({ fleet_id: "fleet-2" }, token));
    expect(res.status).toBe(200);

    const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
    const claims = await verifyJwt(setCookie!.value, { secret: SECRET });
    expect(claims.fleet_id).toBe("fleet-2");

    const stored = await userRepo.findByEmail("user@example.com");
    expect(stored?.last_fleet_id).toBe("fleet-2");
  });
});
