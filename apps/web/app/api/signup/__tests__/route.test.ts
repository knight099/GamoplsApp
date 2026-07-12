import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifyJwt } from "@gamopls/auth";
import { createSignupHandler } from "../route.js";
import { InMemoryOrgRepository } from "@/lib/org-repository";
import { InMemoryUserRepository } from "@/lib/user-repository";
import * as fleetServiceClient from "@/lib/fleet-service-client";

vi.mock("@/lib/fleet-service-client");

const SECRET = "test-secret";

function makeRequest(body: unknown) {
  return new NextRequest(new URL("http://web.local/api/signup"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/signup", () => {
  let orgRepo: InMemoryOrgRepository;
  let userRepo: InMemoryUserRepository;

  beforeEach(() => {
    orgRepo = new InMemoryOrgRepository();
    userRepo = new InMemoryUserRepository();
    process.env.JWT_SECRET = SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for a missing field", async () => {
    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest({ email: "a@example.com", password: "password123" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed email", async () => {
    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest({ email: "not-an-email", password: "password123", name: "A", org_name: "Acme" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a password under 8 characters", async () => {
    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest({ email: "a@example.com", password: "short", name: "A", org_name: "Acme" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 for a duplicate email", async () => {
    await userRepo.create({ org_id: "org-1", email: "a@example.com", password_hash: "h", name: "A", role: "owner", last_fleet_id: "fleet-1" });
    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest({ email: "a@example.com", password: "password123", name: "A", org_name: "Acme" }));
    expect(res.status).toBe(409);
  });

  it("new-org mode: creates Org + User(owner) + Fleet via services/fleet, and issues a session", async () => {
    vi.mocked(fleetServiceClient.createOrgFleet).mockResolvedValue({
      id: "fleet-new", org_id: "will-be-set", name: "Main Fleet", created_at: new Date().toISOString(),
    });

    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest({ email: "owner@example.com", password: "password123", name: "Owner", org_name: "Acme Fleet Co" }));
    expect(res.status).toBe(200);

    const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
    const claims = await verifyJwt(setCookie!.value, { secret: SECRET });
    expect(claims.fleet_id).toBe("fleet-new");
    expect(claims.role).toBe("owner");

    const user = await userRepo.findByEmail("owner@example.com");
    expect(user?.role).toBe("owner");
    expect(user?.last_fleet_id).toBe("fleet-new");
    expect(user?.org_id).toBe(claims.org_id);

    const createdFleetCall = vi.mocked(fleetServiceClient.createOrgFleet).mock.calls[0];
    expect(createdFleetCall).toEqual([claims.org_id, "Main Fleet"]);
  });

  it("new-org mode: deletes the orphaned Org if Fleet creation fails (compensating action)", async () => {
    vi.mocked(fleetServiceClient.createOrgFleet).mockRejectedValue(
      new fleetServiceClient.FleetServiceClientError("boom", 503),
    );
    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest({ email: "owner@example.com", password: "password123", name: "Owner", org_name: "Acme Fleet Co" }));
    expect(res.status).toBe(502);
    expect(await userRepo.findByEmail("owner@example.com")).toBeNull();
  });

  it("invite mode: creates only a User(fleet_manager) in the invited org, using its earliest fleet", async () => {
    const org = await orgRepo.create("Existing Org");
    vi.mocked(fleetServiceClient.earliestOrgFleet).mockResolvedValue({
      id: "fleet-earliest", org_id: org.id, name: "Main Fleet", created_at: new Date().toISOString(),
    });

    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(
      makeRequest({ email: "teammate@example.com", password: "password123", name: "Teammate", invite_token: org.invite_token }),
    );
    expect(res.status).toBe(200);

    const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
    const claims = await verifyJwt(setCookie!.value, { secret: SECRET });
    expect(claims).toMatchObject({ org_id: org.id, fleet_id: "fleet-earliest", role: "fleet_manager" });
    expect(vi.mocked(fleetServiceClient.createOrgFleet)).not.toHaveBeenCalled();
  });

  it("invite mode: returns 400 for an invalid/regenerated invite token", async () => {
    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(
      makeRequest({ email: "teammate@example.com", password: "password123", name: "Teammate", invite_token: "no-such-token" }),
    );
    expect(res.status).toBe(400);
    expect(await userRepo.findByEmail("teammate@example.com")).toBeNull();
  });
});
