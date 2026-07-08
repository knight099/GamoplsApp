import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { issueJwt, SESSION_COOKIE_NAME, type GamoplsJwtClaims } from "@gamopls/auth";
import { buildUpstreamUrl, createGatewayHandler } from "../gateway-proxy.js";

const SECRET = "test-secret";
const CLAIMS: GamoplsJwtClaims = {
  user_id: "user-1",
  org_id: "org-real",
  fleet_id: "fleet-real",
  role: "fleet_manager",
};

function makeRequest(url: string, init: { cookie?: string; method?: string } = {}) {
  const headers = new Headers();
  if (init.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(new URL(url), { method: init.method ?? "GET", headers });
}

function makeContext(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

describe("buildUpstreamUrl", () => {
  it("appends path segments and injects org_id/fleet_id, overwriting client-supplied values", () => {
    const url = buildUpstreamUrl(
      "http://localhost:4401",
      ["assets", "positions"],
      "?org_id=attacker-org&fleet_id=attacker-fleet&foo=bar",
      { org_id: "real-org", fleet_id: "real-fleet" },
    );
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/assets/positions");
    expect(parsed.searchParams.get("org_id")).toBe("real-org");
    expect(parsed.searchParams.get("fleet_id")).toBe("real-fleet");
    expect(parsed.searchParams.get("foo")).toBe("bar");
  });
});

describe("createGatewayHandler", () => {
  const ENV_VAR = "MAP_SERVICE_URL";

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
    process.env[ENV_VAR] = "http://backend.internal:4401";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env[ENV_VAR];
  });

  it("returns 401 when there is no session cookie", async () => {
    const handler = createGatewayHandler(ENV_VAR);
    const request = makeRequest("http://web.local/api/map/assets");
    const response = await handler(request, makeContext(["assets"]));
    expect(response.status).toBe(401);
  });

  it("returns 401 when the session cookie is an invalid/tampered token", async () => {
    const handler = createGatewayHandler(ENV_VAR);
    const request = makeRequest("http://web.local/api/map/assets", {
      cookie: `${SESSION_COOKIE_NAME}=not-a-real-jwt`,
    });
    const response = await handler(request, makeContext(["assets"]));
    expect(response.status).toBe(401);
  });

  it("forwards the request to the backend with org_id/fleet_id from the token when the JWT is valid", async () => {
    const token = await issueJwt(CLAIMS, { secret: SECRET });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const handler = createGatewayHandler(ENV_VAR);
    const request = makeRequest("http://web.local/api/map/assets?foo=bar", {
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
    });
    const response = await handler(request, makeContext(["assets"]));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(calledUrl);
    expect(parsed.origin + parsed.pathname).toBe("http://backend.internal:4401/assets");
    expect(parsed.searchParams.get("org_id")).toBe(CLAIMS.org_id);
    expect(parsed.searchParams.get("fleet_id")).toBe(CLAIMS.fleet_id);
    expect(parsed.searchParams.get("foo")).toBe("bar");
  });

  it("overwrites a client-supplied org_id/fleet_id in the query string with the token's values (anti-spoofing)", async () => {
    const token = await issueJwt(CLAIMS, { secret: SECRET });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const handler = createGatewayHandler(ENV_VAR);
    const request = makeRequest(
      "http://web.local/api/map/assets?org_id=someone-elses-org&fleet_id=someone-elses-fleet",
      { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    );
    await handler(request, makeContext(["assets"]));

    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(calledUrl);
    expect(parsed.searchParams.get("org_id")).toBe(CLAIMS.org_id);
    expect(parsed.searchParams.get("fleet_id")).toBe(CLAIMS.fleet_id);
    expect(parsed.searchParams.get("org_id")).not.toBe("someone-elses-org");
  });

  it("returns 500 when the service base URL env var is not configured", async () => {
    delete process.env[ENV_VAR];
    const token = await issueJwt(CLAIMS, { secret: SECRET });
    const handler = createGatewayHandler(ENV_VAR);
    const request = makeRequest("http://web.local/api/map/assets", {
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
    });
    const response = await handler(request, makeContext(["assets"]));
    expect(response.status).toBe(500);
  });
});
