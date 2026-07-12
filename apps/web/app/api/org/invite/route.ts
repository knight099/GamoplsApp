import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@gamopls/auth";
import { getPrismaClient } from "@gamopls/db";
import { requireSession } from "@/lib/require-session";
import { PrismaOrgRepository } from "@/lib/prisma-org-repository";
import type { OrgRepository } from "@/lib/org-repository";

export interface CreateOrgInviteHandlerOptions {
  orgRepo?: OrgRepository;
}

/** Regenerates the org's invite token, immediately invalidating any link issued before this call. Owner-only. */
export function createOrgInviteHandler(options: CreateOrgInviteHandlerOptions = {}) {
  const orgRepo = options.orgRepo ?? new PrismaOrgRepository(getPrismaClient());

  return async function orgInviteHandler(request: NextRequest): Promise<NextResponse> {
    const session = await requireSession(request);
    if (session instanceof NextResponse) return session;
    const claims = session;

    if (!requireRole(claims, "owner")) {
      return NextResponse.json({ error: "owner role required" }, { status: 403 });
    }

    const newToken = await orgRepo.regenerateInviteToken(claims.org_id);
    return NextResponse.json({ invite_link: `${request.nextUrl.origin}/signup?invite=${newToken}` });
  };
}

export const POST = createOrgInviteHandler();
