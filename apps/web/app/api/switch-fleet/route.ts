import { NextRequest, NextResponse } from "next/server";
import { issueJwt } from "@gamopls/auth";
import { getPrismaClient } from "@gamopls/db";
import { applySessionCookie } from "@/lib/session-cookie";
import { requireSession } from "@/lib/require-session";
import { PrismaUserRepository } from "@/lib/prisma-user-repository";
import { listOrgFleets, FleetServiceClientError } from "@/lib/fleet-service-client";
import type { UserRepository } from "@/lib/user-repository";

export interface CreateSwitchFleetHandlerOptions {
  userRepo?: UserRepository;
}

/**
 * Re-issues the session JWT with a new fleet_id, after confirming the
 * target fleet belongs to the caller's org (via services/fleet's GET
 * /fleets — never trusts a client-supplied fleet_id without this check).
 * Also persists the choice onto User.last_fleet_id so the next login
 * resumes in this fleet instead of always defaulting to the org's first.
 */
export function createSwitchFleetHandler(options: CreateSwitchFleetHandlerOptions = {}) {
  const userRepo = options.userRepo ?? new PrismaUserRepository(getPrismaClient());

  return async function switchFleetHandler(request: NextRequest): Promise<NextResponse> {
    const session = await requireSession(request);
    if (session instanceof NextResponse) return session;
    const claims = session;

    const body = await request.json().catch(() => null);
    if (!body || typeof body.fleet_id !== "string" || body.fleet_id.length === 0) {
      return NextResponse.json({ error: "fleet_id is required" }, { status: 400 });
    }

    let fleets;
    try {
      fleets = await listOrgFleets(claims.org_id);
    } catch (err) {
      if (err instanceof FleetServiceClientError) {
        return NextResponse.json({ error: "Failed to verify fleet ownership" }, { status: err.status ?? 502 });
      }
      throw err;
    }
    if (!fleets.some((f) => f.id === body.fleet_id)) {
      return NextResponse.json({ error: "Fleet does not belong to this org" }, { status: 403 });
    }

    await userRepo.updateLastFleetId(claims.user_id, body.fleet_id);

    const newToken = await issueJwt({
      user_id: claims.user_id,
      org_id: claims.org_id,
      fleet_id: body.fleet_id,
      role: claims.role,
    });
    const response = NextResponse.json({ ok: true, fleet_id: body.fleet_id });
    applySessionCookie(response, newToken);
    return response;
  };
}

export const POST = createSwitchFleetHandler();
