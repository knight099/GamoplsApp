import { NextResponse } from "next/server";
import { buildSessionCookieOptions } from "@gamopls/auth";

/**
 * Sets the session cookie on a NextResponse from a freshly issued JWT.
 * Shared by /api/login, /api/signup, and /api/switch-fleet so the
 * cookie-option mapping lives in exactly one place (suggestions.md C-10
 * territory — this was duplicated inline in two places before this task).
 */
export function applySessionCookie(response: NextResponse, token: string): void {
  const cookie = buildSessionCookieOptions(token);
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });
}
