import type { GamoplsJwtClaims } from "@gamopls/auth";

/**
 * V1 PLACEHOLDER LOGIN — there is no real user/identity service yet
 * (see CLAUDE.md's "Current stage" and PLAN.md Phase 6.2). This checks a
 * single hardcoded-or-env-configured demo credential and, on success, hands
 * back the JWT claims to mint a session for. It exists only to get a valid
 * JWT into a cookie so the gateway route handlers have something to verify
 * end-to-end for the Chennai pilot demo — replace with a real identity
 * provider (Auth0/Clerk/etc, per CLAUDE.md's swappable-auth decision)
 * before this goes anywhere near production multi-tenant use.
 */
export interface DemoLoginCredentials {
  username: string;
  password: string;
}

const DEMO_USERNAME = process.env.DEMO_LOGIN_USERNAME ?? "demo";
const DEMO_PASSWORD = process.env.DEMO_LOGIN_PASSWORD ?? "demo";
const DEMO_ORG_ID = process.env.DEMO_LOGIN_ORG_ID ?? "org-demo";
const DEMO_FLEET_ID = process.env.DEMO_LOGIN_FLEET_ID ?? "fleet-demo";
const DEMO_ROLE = process.env.DEMO_LOGIN_ROLE ?? "fleet_manager";

export function checkDemoCredentials(credentials: DemoLoginCredentials): GamoplsJwtClaims | null {
  if (credentials.username !== DEMO_USERNAME || credentials.password !== DEMO_PASSWORD) {
    return null;
  }
  return {
    user_id: `demo-${credentials.username}`,
    org_id: DEMO_ORG_ID,
    fleet_id: DEMO_FLEET_ID,
    role: DEMO_ROLE,
  };
}
