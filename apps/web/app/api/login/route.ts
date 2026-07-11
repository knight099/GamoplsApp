import { NextRequest, NextResponse } from "next/server";
import { issueJwt, buildSessionCookieOptions } from "@gamopls/auth";
import { checkDemoCredentials } from "@/lib/demo-login";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * V1 placeholder login endpoint — see lib/demo-login.ts for why this is a
 * hardcoded/env-configured demo check rather than real identity. On success,
 * issues a JWT via @gamopls/auth and sets it as an httpOnly session cookie
 * so app/api/{map,chat,board,hub}/[...path]/route.ts have a token to verify.
 *
 * Rate limited per client IP (suggestions.md S-6): 10 attempts / 5 minutes.
 */
const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 5 * 60_000 };

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

export async function POST(request: NextRequest) {
  const rate = checkRateLimit(`login:${clientKey(request)}`, LOGIN_RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }

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
