import { NextRequest, NextResponse } from "next/server";
import { issueJwt, verifyPassword } from "@gamopls/auth";
import { getPrismaClient } from "@gamopls/db";
import { applySessionCookie } from "@/lib/session-cookie";
import { PrismaUserRepository } from "@/lib/prisma-user-repository";
import { earliestOrgFleet } from "@/lib/fleet-service-client";
import { checkRateLimit } from "@/lib/rate-limit";
import type { UserRepository } from "@/lib/user-repository";

const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 5 * 60_000 };

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

export interface CreateLoginHandlerOptions {
  userRepo?: UserRepository;
}

/**
 * Real, database-backed login (suggestions.md S-5). Replaces the
 * hardcoded-credential check that used to live in lib/demo-login.ts,
 * deleted as part of this change — the seeded demo user (see
 * packages/db/prisma/seed.ts) now flows through this exact path.
 *
 * Kept out of route.ts: Next.js's App Router validates that a route.ts
 * file exports ONLY HTTP method handlers (GET/POST/etc.) plus a small
 * set of known config fields — a named factory export like this one
 * fails that validation at build time if it lives in route.ts itself.
 */
export function createLoginHandler(options: CreateLoginHandlerOptions = {}) {
  const userRepo = options.userRepo ?? new PrismaUserRepository(getPrismaClient());

  return async function loginHandler(request: NextRequest): Promise<NextResponse> {
    const rate = checkRateLimit(`login:${clientKey(request)}`, LOGIN_RATE_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again shortly." },
        { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }

    const user = await userRepo.findByEmail(body.email.trim().toLowerCase());
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    let fleetId = user.last_fleet_id;
    if (!fleetId) {
      const fleet = await earliestOrgFleet(user.org_id);
      if (!fleet) {
        return NextResponse.json({ error: "Your org has no fleet yet — contact your admin" }, { status: 409 });
      }
      fleetId = fleet.id;
      await userRepo.updateLastFleetId(user.id, fleetId);
    }

    const token = await issueJwt({ user_id: user.id, org_id: user.org_id, fleet_id: fleetId, role: user.role });
    const response = NextResponse.json({ ok: true, org_id: user.org_id, fleet_id: fleetId });
    applySessionCookie(response, token);
    return response;
  };
}
