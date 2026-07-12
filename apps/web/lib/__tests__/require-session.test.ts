import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { issueJwt, SESSION_COOKIE_NAME } from "@gamopls/auth";
import { requireSession } from "../require-session.js";

const SECRET = "test-secret";

function makeRequest(cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(new URL("http://web.local/api/whatever"), { headers });
}

describe("requireSession", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it("returns a 401 NextResponse when there is no session cookie", async () => {
    const result = await requireSession(makeRequest());
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns a 401 NextResponse for an invalid token", async () => {
    const result = await requireSession(makeRequest("not-a-real-jwt"));
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns the verified claims for a valid session", async () => {
    const token = await issueJwt(
      { user_id: "user-1", org_id: "org-1", fleet_id: "fleet-1", role: "owner" },
      { secret: SECRET },
    );
    const result = await requireSession(makeRequest(token));
    expect(result).not.toBeInstanceOf(NextResponse);
    expect(result).toMatchObject({ user_id: "user-1", org_id: "org-1", fleet_id: "fleet-1", role: "owner" });
  });
});
