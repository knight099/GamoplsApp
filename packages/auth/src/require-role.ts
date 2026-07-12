/**
 * Checks whether a session's role is one of the allowed roles, for a
 * gateway-layer authorization check (suggestions.md S-5). A plain
 * function, not middleware — called explicitly at the top of a route
 * handler, mirroring how verifyScopeHeader is used rather than injected
 * globally.
 */
export function requireRole(claims: { role: string }, ...allowed: string[]): boolean {
  return allowed.includes(claims.role);
}
