/**
 * Multi-tenancy claims carried on every GAMOPLS TeamCore session JWT.
 *
 * `org_id`/`fleet_id` are the scoping keys the gateway route handlers in
 * apps/web use to enforce tenant isolation before a request ever reaches
 * map/chat/board/hub — see CLAUDE.md's "Multi-tenancy scoping is enforced
 * at the API gateway" rule.
 */
export interface GamoplsJwtClaims {
  /** Subject / user id. */
  user_id: string;
  org_id: string;
  fleet_id: string;
  role: string;
}

/** Shape returned by verification: the app claims plus standard JWT registered claims. */
export interface VerifiedGamoplsJwtClaims extends GamoplsJwtClaims {
  iat: number;
  exp: number;
}

export function isGamoplsJwtClaims(value: unknown): value is GamoplsJwtClaims {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.user_id === "string" &&
    typeof v.org_id === "string" &&
    typeof v.fleet_id === "string" &&
    typeof v.role === "string"
  );
}
