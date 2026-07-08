import { NextRequest, NextResponse } from "next/server";
import { issueJwt, buildSessionCookieOptions } from "@gamopls/auth";
import { checkDemoCredentials } from "@/lib/demo-login";

/**
 * V1 placeholder login endpoint — see lib/demo-login.ts for why this is a
 * hardcoded/env-configured demo check rather than real identity. On success,
 * issues a JWT via @gamopls/auth and sets it as an httpOnly session cookie
 * so app/api/{map,chat,board,hub}/[...path]/route.ts have a token to verify.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  const claims = checkDemoCredentials({ username: body.username, password: body.password });
  if (!claims) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await issueJwt(claims);
  const cookie = buildSessionCookieOptions(token);

  const response = NextResponse.json({ ok: true, org_id: claims.org_id, fleet_id: claims.fleet_id });
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });
  return response;
}
