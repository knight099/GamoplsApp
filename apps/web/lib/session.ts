import { cookies } from "next/headers";
import { verifyJwt, SESSION_COOKIE_NAME, type VerifiedGamoplsJwtClaims } from "@gamopls/auth";

/** Reads and verifies the current request's session JWT, for use in Server Components/layouts. Returns null if absent or invalid — callers should not throw on a logged-out visitor. */
export async function getSession(): Promise<VerifiedGamoplsJwtClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await verifyJwt(token);
  } catch {
    return null;
  }
}
