import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hashPassword, SESSION_COOKIE_NAME, verifyJwt } from "@gamopls/auth";
import { createLoginHandler } from "../handler.js";
import { InMemoryUserRepository } from "@/lib/user-repository";
import * as fleetServiceClient from "@/lib/fleet-service-client";

vi.mock("@/lib/fleet-service-client");

const SECRET = "test-secret";

function makeRequest(body: unknown) {
  return new NextRequest(new URL("http://web.local/api/login"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/login", () => {
  let userRepo: InMemoryUserRepository;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    process.env.JWT_SECRET = SECRET;
    vi.restoreAllMocks();
  });

  it("returns 400 when email or password is missing", async () => {
    const handler = createLoginHandler({ userRepo });
    const res = await handler(makeRequest({ email: "a@example.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 for an unknown email", async () => {
    const handler = createLoginHandler({ userRepo });
    const res = await handler(makeRequest({ email: "nobody@example.com", password: "whatever123" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 for the wrong password", async () => {
    const passwordHash = await hashPassword("correct-password");
    await userRepo.create({
      org_id: "org-1", email: "user@example.com", password_hash: passwordHash,
      name: "Test User", role: "owner", last_fleet_id: "fleet-1",
    });
    const handler = createLoginHandler({ userRepo });
    const res = await handler(makeRequest({ email: "user@example.com", password: "wrong-password" }));
    expect(res.status).toBe(401);
  });

  it("issues a session with the expected claim shape on success", async () => {
    const passwordHash = await hashPassword("correct-password");
    const user = await userRepo.create({
      org_id: "org-1", email: "user@example.com", password_hash: passwordHash,
      name: "Test User", role: "owner", last_fleet_id: "fleet-1",
    });
    const handler = createLoginHandler({ userRepo });
    const res = await handler(makeRequest({ email: "user@example.com", password: "correct-password" }));
    expect(res.status).toBe(200);

    const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(setCookie?.value).toBeTruthy();
    const claims = await verifyJwt(setCookie!.value, { secret: SECRET });
    expect(claims).toMatchObject({ user_id: user.id, org_id: "org-1", fleet_id: "fleet-1", role: "owner" });
  });

  it("falls back to the org's earliest fleet when last_fleet_id is unset, and persists it", async () => {
    vi.mocked(fleetServiceClient.earliestOrgFleet).mockResolvedValue({
      id: "fleet-earliest", org_id: "org-1", name: "Main Fleet", created_at: new Date().toISOString(),
    });
    const passwordHash = await hashPassword("correct-password");
    userRepo.seed({
      id: "user-1", org_id: "org-1", email: "user@example.com", password_hash: passwordHash,
      name: "Test User", role: "owner", last_fleet_id: null, created_at: new Date().toISOString(),
    });

    const handler = createLoginHandler({ userRepo });
    const res = await handler(makeRequest({ email: "user@example.com", password: "correct-password" }));
    const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
    const claims = await verifyJwt(setCookie!.value, { secret: SECRET });
    expect(claims.fleet_id).toBe("fleet-earliest");

    const stored = await userRepo.findByEmail("user@example.com");
    expect(stored?.last_fleet_id).toBe("fleet-earliest");
  });
});
