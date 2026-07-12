import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@gamopls/auth";
import { getPrismaClient } from "@gamopls/db";
import { requireSession } from "@/lib/require-session";
import { PrismaOrgRepository } from "@/lib/prisma-org-repository";
import { PrismaUserRepository } from "@/lib/prisma-user-repository";
import type { OrgRepository } from "@/lib/org-repository";
import type { UserRepository } from "@/lib/user-repository";

export interface CreateOrgHandlerOptions {
  orgRepo?: OrgRepository;
  userRepo?: UserRepository;
}

/**
 * Owner-only org/team info: org name, invite link, and the member list.
 * One of exactly two routes in this app that check `role` (suggestions.md
 * S-5) — everything else stays governed purely by tenant scope.
 *
 * Kept out of route.ts: Next.js's App Router validates that a route.ts
 * file exports ONLY HTTP method handlers (GET/POST/etc.) plus a small
 * set of known config fields — a named factory export like this one
 * fails that validation at build time if it lives in route.ts itself.
 */
export function createOrgHandler(options: CreateOrgHandlerOptions = {}) {
  const orgRepo = options.orgRepo ?? new PrismaOrgRepository(getPrismaClient());
  const userRepo = options.userRepo ?? new PrismaUserRepository(getPrismaClient());

  return async function orgHandler(request: NextRequest): Promise<NextResponse> {
    const session = await requireSession(request);
    if (session instanceof NextResponse) return session;
    const claims = session;

    if (!requireRole(claims, "owner")) {
      return NextResponse.json({ error: "owner role required" }, { status: 403 });
    }

    const org = await orgRepo.findById(claims.org_id);
    if (!org) {
      return NextResponse.json({ error: "org not found" }, { status: 404 });
    }
    const members = await userRepo.listByOrg(claims.org_id);

    return NextResponse.json({
      id: org.id,
      name: org.name,
      invite_link: `${request.nextUrl.origin}/signup?invite=${org.invite_token}`,
      members: members.map((m) => ({ id: m.id, email: m.email, name: m.name, role: m.role, created_at: m.created_at })),
    });
  };
}
