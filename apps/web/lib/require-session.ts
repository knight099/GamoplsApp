import { NextRequest, NextResponse } from "next/server";
import { verifyJwt, JwtVerificationError, SESSION_COOKIE_NAME, type VerifiedGamoplsJwtClaims } from "@gamopls/auth";

/**
 * Reads and verifies the session cookie from a route handler request.
 * Returns the verified claims, or a ready-to-return 401 NextResponse if
 * the session is missing/invalid. Callers do:
 *
 *   const session = await requireSession(request);
 *   if (session instanceof NextResponse) return session;
 *   // session is VerifiedGamoplsJwtClaims here
 *
 * Extracted because this exact five-line block was about to be
 * duplicated a third time (suggestions.md C-10: "switch-fleet
 * re-implements gateway auth inline... reuse a shared requireSession()
 * helper").
 */
export async function requireSession(
  request: NextRequest,
): Promise<VerifiedGamoplsJwtClaims | NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized: missing session" }, { status: 401 });
  }
  try {
    return await verifyJwt(token);
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return NextResponse.json({ error: "Unauthorized: invalid session" }, { status: 401 });
    }
    throw err;
  }
}
