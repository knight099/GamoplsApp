import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@gamopls/auth";

const prisma = new PrismaClient();

/**
 * Seeds one Org + User matching today's DEMO_LOGIN_* env vars (see
 * apps/web/lib/demo-login.ts, deleted once real login lands) so
 * `demo`/<password> keeps working through the real signup/login path
 * instead of a hardcoded env-var check.
 */
async function main() {
  const username = process.env.DEMO_LOGIN_USERNAME ?? "demo";
  const password = process.env.DEMO_LOGIN_PASSWORD ?? "demo";
  // DEMO_LOGIN_USERNAME may be a bare handle ("demo") or a full email
  // ("admin@gamopls.com") — don't double up the domain if it's already one.
  const email = username.includes("@") ? username : `${username}@example.com`;

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
  // Login requires the org to have at least one fleet (see
  // apps/web/app/api/login/handler.ts's earliestOrgFleet check) — without
  // this, a freshly seeded user can authenticate but never gets past login.
  const fleet = await prisma.fleet.create({ data: { org_id: org.id, name: "Demo Fleet" } });

  console.log(`seed: created Org ${org.id}, Fleet ${fleet.id}, User ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
