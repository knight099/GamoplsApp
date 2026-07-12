import { NextRequest, NextResponse } from "next/server";
import { hashPassword, issueJwt } from "@gamopls/auth";
import { getPrismaClient } from "@gamopls/db";
import { applySessionCookie } from "@/lib/session-cookie";
import { PrismaOrgRepository } from "@/lib/prisma-org-repository";
import { PrismaUserRepository } from "@/lib/prisma-user-repository";
import type { OrgRepository } from "@/lib/org-repository";
import type { UserRepository } from "@/lib/user-repository";
import { createOrgFleet, earliestOrgFleet, FleetServiceClientError } from "@/lib/fleet-service-client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export interface CreateSignupHandlerOptions {
  orgRepo?: OrgRepository;
  userRepo?: UserRepository;
}

/**
 * Signup (suggestions.md S-5). Two modes selected by whether the body
 * carries invite_token:
 *  - New org: creates Org + User(owner) + Fleet("Main Fleet") — Fleet is
 *    created via services/fleet's HTTP API, never written directly to
 *    the `fleets` table (see Global Constraints). If that call fails,
 *    the just-created Org is deleted (compensating action, matching the
 *    saga pattern services/fleet's own vehicle onboarding already uses).
 *  - Join via invite: looks up the Org by invite_token, creates only a
 *    User(fleet_manager) in it, using the org's earliest fleet.
 */
export function createSignupHandler(options: CreateSignupHandlerOptions = {}) {
  const orgRepo = options.orgRepo ?? new PrismaOrgRepository(getPrismaClient());
  const userRepo = options.userRepo ?? new PrismaUserRepository(getPrismaClient());

  return async function signupHandler(request: NextRequest): Promise<NextResponse> {
    const body = await request.json().catch(() => null);
    if (
      !body ||
      typeof body.email !== "string" ||
      typeof body.password !== "string" ||
      typeof body.name !== "string" ||
      !body.name.trim()
    ) {
      return NextResponse.json({ error: "email, password, and name are required" }, { status: 400 });
    }
    const email = body.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    if (body.password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 },
      );
    }
    if (await userRepo.findByEmail(email)) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const passwordHash = await hashPassword(body.password);
    const inviteToken = typeof body.invite_token === "string" ? body.invite_token : null;

    let orgId: string;
    let fleetId: string;
    let role: string;

    if (inviteToken) {
      const org = await orgRepo.findByInviteToken(inviteToken);
      if (!org) {
        return NextResponse.json(
          { error: "This invite link is no longer valid. Ask your team admin for a new one." },
          { status: 400 },
        );
      }
      const fleet = await earliestOrgFleet(org.id);
      if (!fleet) {
        return NextResponse.json(
          { error: "This org has no fleet yet — ask your admin to create one first" },
          { status: 409 },
        );
      }
      orgId = org.id;
      fleetId = fleet.id;
      role = "fleet_manager";
    } else {
      if (typeof body.org_name !== "string" || !body.org_name.trim()) {
        return NextResponse.json({ error: "Company/org name is required" }, { status: 400 });
      }
      const org = await orgRepo.create(body.org_name.trim());
      try {
        const fleet = await createOrgFleet(org.id, "Main Fleet");
        fleetId = fleet.id;
      } catch (err) {
        await orgRepo.delete(org.id);
        if (err instanceof FleetServiceClientError) {
          return NextResponse.json({ error: "Failed to set up your fleet, please try again" }, { status: 502 });
        }
        throw err;
      }
      orgId = org.id;
      role = "owner";
    }

    const user = await userRepo.create({
      org_id: orgId,
      email,
      password_hash: passwordHash,
      name: body.name.trim(),
      role,
      last_fleet_id: fleetId,
    });

    const token = await issueJwt({ user_id: user.id, org_id: orgId, fleet_id: fleetId, role });
    const response = NextResponse.json({ ok: true, org_id: orgId, fleet_id: fleetId });
    applySessionCookie(response, token);
    return response;
  };
}

export const POST = createSignupHandler();
