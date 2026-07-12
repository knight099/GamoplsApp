import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@gamopls/auth";

const prisma = new PrismaClient();

/**
 * Seeds one Org + User matching today's DEMO_LOGIN_* env vars (see
 * apps/web/lib/demo-login.ts, deleted once real login lands) so
 * `demo`/<password> keeps working through the real signup/login path
 * instead of a hardcoded env-var check, and backfills any pre-existing
 * pilot-data fleets carrying the old free-string org id (suggestions.md
 * D-3) so the Fleet FK migration doesn't orphan them.
 */
async function main() {
  const username = process.env.DEMO_LOGIN_USERNAME ?? "demo";
  const password = process.env.DEMO_LOGIN_PASSWORD ?? "demo";
  const legacyOrgId = process.env.DEMO_LOGIN_ORG_ID ?? "org-demo";
  const email = `${username}@example.com`;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`seed: ${email} already exists, skipping`);
    return;
  }

  const org = await prisma.org.create({ data: { name: "Demo Org" } });
  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      org_id: org.id,
      email,
      password_hash: passwordHash,
      name: "Demo User",
      role: "owner",
    },
  });

  // fleets.org_id is still a free-text column at this point in the
  // migration sequence (a later migration tightens it to a real Org FK).
  const updatedCount = await prisma.$executeRaw`
    UPDATE fleets SET org_id = ${org.id}::text WHERE org_id = ${legacyOrgId}
  `;
  console.log(`seed: created Org ${org.id}, User ${email}, backfilled ${updatedCount} fleet(s)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
