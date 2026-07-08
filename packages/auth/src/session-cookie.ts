/**
 * Cookie helpers shared by apps/web's login route (sets the cookie) and
 * gateway route handlers (read it). Kept framework-agnostic — this returns
 * plain option objects rather than importing `next/headers`, so it stays
 * usable outside a Next.js request context (e.g. in tests).
 */
export const SESSION_COOKIE_NAME = "gamopls_session";

export interface SessionCookieOptions {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge: number;
}

/** Options for setting the session cookie after a successful demo login. */
export function buildSessionCookieOptions(
  token: string,
  maxAgeSeconds = 60 * 60,
): SessionCookieOptions {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Options for clearing the session cookie on logout. */
export function buildLogoutCookieOptions(): SessionCookieOptions {
  return {
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}
