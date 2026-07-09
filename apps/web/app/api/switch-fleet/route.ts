import { NextRequest, NextResponse } from "next/server";
import { issueJwt, verifyJwt, buildSessionCookieOptions, JwtVerificationError, SESSION_COOKIE_NAME } from "@gamopls/auth";

/**
 * Re-issues the session JWT with a new `fleet_id`, after confirming the
 * target fleet belongs to the caller's org (via services/fleet's GET
 * /fleets, the same source of truth the fleet-switcher dropdown lists
 * from — never trusts a client-supplied fleet_id without this check).
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized: missing session" }, { status: 401 });
  }

  let claims;
  try {
    claims = await verifyJwt(token);
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return NextResponse.json({ error: "Unauthorized: invalid session" }, { status: 401 });
    }
    throw err;
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.fleet_id !== "string" || body.fleet_id.length === 0) {
    return NextResponse.json({ error: "fleet_id is required" }, { status: 400 });
  }

  const fleetServiceUrl = process.env.FLEET_SERVICE_URL;
  if (!fleetServiceUrl) {
    return NextResponse.json({ error: "Gateway misconfigured: FLEET_SERVICE_URL is not set" }, { status: 500 });
  }

  const fleetsRes = await fetch(`${fleetServiceUrl.replace(/\/+$/, "")}/fleets?org_id=${encodeURIComponent(claims.org_id)}`);
  if (!fleetsRes.ok) {
    return NextResponse.json({ error: "Failed to verify fleet ownership" }, { status: 502 });
  }
  const { fleets } = (await fleetsRes.json()) as { fleets: { id: string }[] };
  if (!fleets.some((f) => f.id === body.fleet_id)) {
    return NextResponse.json({ error: "Fleet does not belong to this org" }, { status: 403 });
  }

  const newToken = await issueJwt({
    user_id: claims.user_id,
    org_id: claims.org_id,
    fleet_id: body.fleet_id,
    role: claims.role,
  });
  const cookie = buildSessionCookieOptions(newToken);

  const response = NextResponse.json({ ok: true, fleet_id: body.fleet_id });
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });
  return response;
}
