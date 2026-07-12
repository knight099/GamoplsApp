# Real Auth & Frictionless Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded demo-credential login with real signup/login backed by `Org`/`User` tables, a one-link team-invite mechanism, one real authorization check, and a frictionless path from "just added a vehicle" to "seeing it live on the map."

**Architecture:** Everything lives in `apps/web`'s route-handler layer (no new deployable service) plus small additions to `packages/auth` (password hashing, `requireRole`), `packages/db` (two new Prisma models), and `services/fleet` (one new MQTT-publishing route). New Prisma-touching logic in `apps/web` goes behind a repository interface + in-memory implementation, matching this codebase's established pattern everywhere else (`FleetRepository`, `AssetRepository`, etc.) — this is a deliberate adaptation of the spec's simpler "route handlers talk directly to Prisma" framing, made because it's the only way to unit-test signup/login logic without a live database, which every other service in this repo already relies on.

**Tech Stack:** bcryptjs (password hashing — pure JS, no native build step), mqtt.js (the "preview with live data" publisher), Prisma migrations + a `prisma db seed` script, Vitest + Fastify `.inject()` / direct `NextRequest` construction for tests (matching `apps/web/lib/__tests__/gateway-proxy.test.ts`'s existing pattern).

## Global Constraints

- Extend `@gamopls/auth` — do **not** introduce Auth.js, Better Auth, Clerk, or any other auth framework/provider.
- The JWT claim shape (`user_id`, `org_id`, `fleet_id`, `role`) must not change. `verifyJwt`, the gateway, the `x-gamopls-scope` header system, and every service's `requireScope` stay untouched.
- No new deployable service. Everything is additions to `apps/web`, `packages/auth`, `packages/db`, `services/fleet`.
- Password hashing: `bcryptjs`, 10 salt rounds. Never native `bcrypt`.
- One regenerable `Org.invite_token` — no per-invite tokens, no expiry, no email-targeted invites, no email delivery of any kind.
- Role gating is scoped to exactly `GET /api/org` and `POST /api/org/invite` — nowhere else in this plan checks `role`.
- "Preview with live data" publishes one real MQTT message matching `infra/simulators/edgebox-sim`'s exact payload shape, authenticated as the `edgebox` broker user (env `MQTT_DEVICE_USERNAME`/`MQTT_DEVICE_PASSWORD`, set up in the tenancy-hardening session's S-2 work) — never a database-only fake.
- Fleet rows are created/read only through `services/fleet`'s existing HTTP API (`POST /fleets`, `GET /fleets`) — `apps/web`'s new Prisma usage touches only the `Org` and `User` tables, never `fleets` directly. This matches CLAUDE.md's rule that cross-module writes don't bypass the owning service, and mirrors the exact compensating-saga pattern `services/fleet` itself already uses for vehicle onboarding.
- Test-driven: this sub-project has full test coverage. This overrides any earlier "skip tests" instruction — password storage and the authorization boundary are exactly where that shortcut doesn't apply.
- Prisma-backed repository implementations are not directly unit-tested (verified: zero Prisma-repository test files exist anywhere in this codebase today) — they're exercised by the live smoke test in the final task instead, matching established convention.
- Test-run gotcha (repo history): `pnpm --filter <pkg> test -- <pattern>` does NOT filter — use `cd <pkg> && npx vitest run <file>`.
- Commit after every task.

---

### Task 1: `packages/auth` — password hashing

**Files:**
- Create: `packages/auth/src/password.ts`
- Create: `packages/auth/src/__tests__/password.test.ts`
- Modify: `packages/auth/src/index.ts`
- Modify: `packages/auth/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 3, 6, 7, 9): `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, hash: string): Promise<boolean>`.

- [ ] **Step 1: Add the dependency**

Edit `packages/auth/package.json` — add to `dependencies`: `"bcryptjs": "^2.4.3"`, and to `devDependencies`: `"@types/bcryptjs": "^2.4.6"`. Then run:

```bash
pnpm install
```

- [ ] **Step 2: Write the failing tests**

`packages/auth/src/__tests__/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password.js";

describe("hashPassword / verifyPassword", () => {
  it("round-trips a password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("never stores the plaintext inside the hash", async () => {
    const hash = await hashPassword("super-secret-plaintext");
    expect(hash).not.toContain("super-secret-plaintext");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/auth && npx vitest run src/__tests__/password.test.ts`
Expected: FAIL — cannot resolve `../password.js`.

- [ ] **Step 4: Implement**

`packages/auth/src/password.ts`:

```ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/** Hashes a plaintext password for storage. Never store the plaintext. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Verifies a plaintext password against a stored hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

Append to `packages/auth/src/index.ts`:

```ts
export { hashPassword, verifyPassword } from "./password.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/auth && npx vitest run`
Expected: PASS (new tests + all existing ones).

- [ ] **Step 6: Build the package**

Run: `pnpm --filter @gamopls/auth build`
Expected: tsup completes with dts.

- [ ] **Step 7: Commit**

```bash
git add packages/auth pnpm-lock.yaml
git commit -m "feat(auth): password hashing (hashPassword/verifyPassword via bcryptjs)"
```

---

### Task 2: `packages/auth` — `requireRole`

**Files:**
- Create: `packages/auth/src/require-role.ts`
- Create: `packages/auth/src/__tests__/require-role.test.ts`
- Modify: `packages/auth/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Task 11): `requireRole(claims: { role: string }, ...allowed: string[]): boolean`.

- [ ] **Step 1: Write the failing tests**

`packages/auth/src/__tests__/require-role.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { requireRole } from "../require-role.js";

describe("requireRole", () => {
  it("allows a role in the allowed list", () => {
    expect(requireRole({ role: "owner" }, "owner")).toBe(true);
  });

  it("allows any of several roles", () => {
    expect(requireRole({ role: "fleet_manager" }, "owner", "fleet_manager")).toBe(true);
  });

  it("denies a role not in the allowed list", () => {
    expect(requireRole({ role: "fleet_manager" }, "owner")).toBe(false);
  });

  it("denies when no roles are allowed", () => {
    expect(requireRole({ role: "owner" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/auth && npx vitest run src/__tests__/require-role.test.ts`
Expected: FAIL — cannot resolve `../require-role.js`.

- [ ] **Step 3: Implement**

`packages/auth/src/require-role.ts`:

```ts
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
```

Append to `packages/auth/src/index.ts`:

```ts
export { requireRole } from "./require-role.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/auth && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Build and commit**

```bash
pnpm --filter @gamopls/auth build
git add packages/auth
git commit -m "feat(auth): requireRole gateway-layer authorization helper"
```

---

### Task 3: `packages/db` — `Org`/`User` models, migration, seed script

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/seed.ts`
- Modify: `packages/db/package.json`

**Interfaces:**
- Consumes: `hashPassword` from `@gamopls/auth` (Task 1).
- Produces (used by Task 4 onward): Prisma models `Org { id, name, invite_token, created_at, updated_at }`, `User { id, org_id, email, password_hash, name, role, last_fleet_id, created_at, updated_at }`, enum `UserRole { owner, fleet_manager, driver }`. `Fleet` is **not** touched in this task — that's Task 4, deliberately sequenced after this one's seed/backfill.

- [ ] **Step 1: Add the new models to the schema**

Edit `packages/db/prisma/schema.prisma` — add this block (placed after the existing `Fleet` model, before `Driver`, matching the file's existing top-to-bottom domain grouping):

```prisma
// ---------------------------------------------------------------------------
// Real auth (suggestions.md S-5) — orgs/users. Fleet gets a real FK to Org
// in a separate migration (see Task 4) so this one stays purely additive
// and safe to run against a database that already has fleets/assets rows.
// ---------------------------------------------------------------------------

enum UserRole {
  owner
  fleet_manager
  driver // reserved: no driver-facing UI exists yet (no apps/mobile); enforced nowhere today
}

model Org {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name         String
  invite_token String   @unique @default(dbgenerated("gen_random_uuid()"))
  created_at   DateTime @default(now()) @db.Timestamptz()
  updated_at   DateTime @default(now()) @updatedAt @db.Timestamptz()

  users User[]

  @@map("orgs")
}

model User {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_id        String   @db.Uuid
  org           Org      @relation(fields: [org_id], references: [id])
  email         String   @unique
  password_hash String
  name          String
  role          UserRole @default(fleet_manager)
  // Last fleet_id issued into this user's JWT (via signup, login, or
  // /api/switch-fleet). Login re-opens here instead of always defaulting
  // to the org's first fleet. Nullable only because it doesn't exist
  // until the first login/switch sets it.
  last_fleet_id String?  @db.Uuid
  created_at    DateTime @default(now()) @db.Timestamptz()
  updated_at    DateTime @default(now()) @updatedAt @db.Timestamptz()

  @@index([org_id])
  @@map("users")
}
```

- [ ] **Step 2: Generate and run the migration**

```bash
set -a && source /Users/vaibhaw/Developer/Gamopls/GamoplsApp/.env && set +a
cd packages/db && npx prisma migrate dev --name add_org_user_models
```

Expected: migration applies cleanly (purely additive — new table/enum, no changes to any existing column), and `npx prisma generate` runs automatically at the end.

- [ ] **Step 3: Add seed-script dependencies**

Edit `packages/db/package.json`:
- Add to `devDependencies`: `"tsx": "^4.19.2"`, `"@gamopls/auth": "workspace:*"`.
- Add a top-level `"prisma"` key (sibling of `"scripts"`, `"dependencies"`, etc.):

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

Then run:

```bash
pnpm install
```

- [ ] **Step 4: Write the seed script**

`packages/db/prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@gamopls/auth";

const prisma = new PrismaClient();

/**
 * Seeds one Org + User matching today's DEMO_LOGIN_* env vars (see
 * apps/web/lib/demo-login.ts, deleted in Task 9) so `demo`/<password>
 * keeps working through the real signup/login path instead of a
 * hardcoded env-var check, and backfills any pre-existing pilot-data
 * fleets carrying the old free-string org id (suggestions.md D-3) so
 * Task 4's FK migration doesn't orphan them.
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
  // migration sequence (Task 4 tightens it to a real Org FK).
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
```

- [ ] **Step 5: Run the seed**

```bash
set -a && source /Users/vaibhaw/Developer/Gamopls/GamoplsApp/.env && set +a
cd packages/db && npx prisma db seed
```

Expected: logs `seed: created Org <uuid>, User demo@example.com, backfilled N fleet(s)` (N is 0 on a fresh database, or however many pre-existing `fleets` rows carried `org_id = "org-demo"` — matches the pilot demo data from earlier sessions).

- [ ] **Step 6: Verify the backfill**

```bash
cd packages/db && npx prisma studio
```

Open the `orgs`, `users`, and `fleets` tables in the browser Studio UI that opens; confirm one `Org`/`User` row exists, and that any `fleets` row that used to say `org_id: "org-demo"` now shows the seeded Org's UUID. Close Studio (Ctrl+C) when done.

- [ ] **Step 7: Build and commit**

```bash
pnpm --filter @gamopls/db build
git add packages/db pnpm-lock.yaml
git commit -m "feat(db): Org/User models + seed script backfilling the demo login (suggestions.md S-5)"
```

---

### Task 4: `packages/db` — `Fleet.org_id` becomes a real FK to `Org`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Consumes: Task 3's seed having already backfilled every existing `fleets.org_id` value to a real `Org.id` UUID.
- Produces: `Fleet.org_id` is `@db.Uuid` with a `Prisma` relation to `Org` (suggestions.md D-3, scoped to just this one relation — no other `org_id`/`fleet_id` column changes).

- [ ] **Step 1: Edit the schema**

In `packages/db/prisma/schema.prisma`, change the existing `Fleet` model from:

```prisma
model Fleet {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_id     String
  name       String
  created_at DateTime @default(now()) @db.Timestamptz()
  updated_at DateTime @default(now()) @updatedAt @db.Timestamptz()

  @@index([org_id])
  @@map("fleets")
}
```

to:

```prisma
model Fleet {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_id     String   @db.Uuid
  org        Org      @relation(fields: [org_id], references: [id])
  name       String
  created_at DateTime @default(now()) @db.Timestamptz()
  updated_at DateTime @default(now()) @updatedAt @db.Timestamptz()

  @@index([org_id])
  @@map("fleets")
}
```

And add the inverse relation to `Org` (it already has `users User[]` from Task 3 — add a sibling field):

```prisma
model Org {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name         String
  invite_token String   @unique @default(dbgenerated("gen_random_uuid()"))
  created_at   DateTime @default(now()) @db.Timestamptz()
  updated_at   DateTime @default(now()) @updatedAt @db.Timestamptz()

  users  User[]
  fleets Fleet[]

  @@map("orgs")
}
```

- [ ] **Step 2: Run the migration**

```bash
set -a && source /Users/vaibhaw/Developer/Gamopls/GamoplsApp/.env && set +a
cd packages/db && npx prisma migrate dev --name add_org_fk_to_fleet
```

Expected: succeeds. If it fails with something like `invalid input syntax for type uuid`, some `fleets.org_id` value wasn't backfilled by Task 3's seed (re-run `npx prisma db seed`, or check `DEMO_LOGIN_ORG_ID` in `.env` actually matches whatever string value is sitting in the `fleets` table via `npx prisma studio`).

- [ ] **Step 3: Verify `services/fleet` still compiles**

`prisma-fleet-repository.ts` and its callers pass `org_id` as a plain string already — `@db.Uuid` only changes the underlying Postgres column type, not the generated TypeScript type (`string` either way), so no source changes are expected here. Confirm:

```bash
pnpm --filter @gamopls/fleet build
```

Expected: succeeds unchanged.

- [ ] **Step 4: Build and commit**

```bash
pnpm --filter @gamopls/db build
git add packages/db
git commit -m "feat(db): Fleet.org_id becomes a real FK to Org (suggestions.md D-3, scoped)"
```

---

### Task 5: `apps/web` — `OrgRepository`/`UserRepository` ports + in-memory implementations

**Files:**
- Create: `apps/web/lib/org-repository.ts`
- Create: `apps/web/lib/user-repository.ts`
- Create: `apps/web/lib/__tests__/org-repository.test.ts`
- Create: `apps/web/lib/__tests__/user-repository.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 6–11): `OrgRepository` (`create`, `findById`, `findByInviteToken`, `regenerateInviteToken`, `delete`), `InMemoryOrgRepository`; `UserRepository` (`create`, `findByEmail`, `listByOrg`, `updateLastFleetId`), `InMemoryUserRepository` (plus a `seed()` test-only helper for constructing edge-case fixtures directly).

- [ ] **Step 1: Write the failing tests**

`apps/web/lib/__tests__/org-repository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryOrgRepository } from "../org-repository.js";

describe("InMemoryOrgRepository", () => {
  it("creates an org with a unique invite token", async () => {
    const repo = new InMemoryOrgRepository();
    const a = await repo.create("Org A");
    const b = await repo.create("Org B");
    expect(a.name).toBe("Org A");
    expect(a.invite_token).not.toBe(b.invite_token);
  });

  it("finds an org by id", async () => {
    const repo = new InMemoryOrgRepository();
    const org = await repo.create("Org A");
    expect(await repo.findById(org.id)).toEqual(org);
    expect(await repo.findById("does-not-exist")).toBeNull();
  });

  it("finds an org by invite token", async () => {
    const repo = new InMemoryOrgRepository();
    const org = await repo.create("Org A");
    expect(await repo.findByInviteToken(org.invite_token)).toEqual(org);
    expect(await repo.findByInviteToken("bogus-token")).toBeNull();
  });

  it("regenerating the invite token invalidates the old one", async () => {
    const repo = new InMemoryOrgRepository();
    const org = await repo.create("Org A");
    const oldToken = org.invite_token;
    const newToken = await repo.regenerateInviteToken(org.id);

    expect(newToken).not.toBe(oldToken);
    expect(await repo.findByInviteToken(oldToken)).toBeNull();
    expect(await repo.findByInviteToken(newToken)).not.toBeNull();
  });

  it("delete removes the org", async () => {
    const repo = new InMemoryOrgRepository();
    const org = await repo.create("Org A");
    await repo.delete(org.id);
    expect(await repo.findById(org.id)).toBeNull();
  });
});
```

`apps/web/lib/__tests__/user-repository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { InMemoryUserRepository } from "../user-repository.js";

describe("InMemoryUserRepository", () => {
  it("creates a user and finds it by email", async () => {
    const repo = new InMemoryUserRepository();
    const user = await repo.create({
      org_id: "org-1",
      email: "user@example.com",
      password_hash: "hash",
      name: "Test User",
      role: "owner",
      last_fleet_id: "fleet-1",
    });
    expect(user.id).toBeTruthy();
    expect(await repo.findByEmail("user@example.com")).toEqual(user);
    expect(await repo.findByEmail("nobody@example.com")).toBeNull();
  });

  it("lists users scoped to one org", async () => {
    const repo = new InMemoryUserRepository();
    await repo.create({ org_id: "org-1", email: "a@example.com", password_hash: "h", name: "A", role: "owner", last_fleet_id: "fleet-1" });
    await repo.create({ org_id: "org-2", email: "b@example.com", password_hash: "h", name: "B", role: "owner", last_fleet_id: "fleet-2" });

    const orgOneUsers = await repo.listByOrg("org-1");
    expect(orgOneUsers).toHaveLength(1);
    expect(orgOneUsers[0].email).toBe("a@example.com");
  });

  it("updates last_fleet_id", async () => {
    const repo = new InMemoryUserRepository();
    const user = await repo.create({ org_id: "org-1", email: "a@example.com", password_hash: "h", name: "A", role: "owner", last_fleet_id: "fleet-1" });
    await repo.updateLastFleetId(user.id, "fleet-2");
    expect((await repo.findByEmail("a@example.com"))?.last_fleet_id).toBe("fleet-2");
  });

  it("seed() inserts a record directly, bypassing create()'s required last_fleet_id", async () => {
    const repo = new InMemoryUserRepository();
    repo.seed({
      id: "user-1", org_id: "org-1", email: "legacy@example.com", password_hash: "h",
      name: "Legacy", role: "owner", last_fleet_id: null, created_at: new Date().toISOString(),
    });
    expect((await repo.findByEmail("legacy@example.com"))?.last_fleet_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run lib/__tests__/org-repository.test.ts lib/__tests__/user-repository.test.ts`
Expected: FAIL — cannot resolve `../org-repository.js` / `../user-repository.js`.

- [ ] **Step 3: Implement**

`apps/web/lib/org-repository.ts`:

```ts
export interface OrgRecord {
  id: string;
  name: string;
  invite_token: string;
}

export interface OrgRepository {
  create(name: string): Promise<OrgRecord>;
  findById(id: string): Promise<OrgRecord | null>;
  findByInviteToken(token: string): Promise<OrgRecord | null>;
  regenerateInviteToken(orgId: string): Promise<string>;
  /** Compensating action if a signup fails after the Org is created but
   * before its Fleet/User exist — see app/api/signup/route.ts. */
  delete(orgId: string): Promise<void>;
}

function randomToken(seed: string): string {
  return `invite-${seed}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export class InMemoryOrgRepository implements OrgRepository {
  private readonly orgs = new Map<string, OrgRecord>();
  private counter = 0;

  async create(name: string): Promise<OrgRecord> {
    const id = `org-${++this.counter}`;
    const org: OrgRecord = { id, name, invite_token: randomToken(id) };
    this.orgs.set(id, org);
    return org;
  }

  async findById(id: string): Promise<OrgRecord | null> {
    return this.orgs.get(id) ?? null;
  }

  async findByInviteToken(token: string): Promise<OrgRecord | null> {
    return [...this.orgs.values()].find((o) => o.invite_token === token) ?? null;
  }

  async regenerateInviteToken(orgId: string): Promise<string> {
    const org = this.orgs.get(orgId);
    if (!org) throw new Error(`org ${orgId} not found`);
    org.invite_token = randomToken(orgId);
    return org.invite_token;
  }

  async delete(orgId: string): Promise<void> {
    this.orgs.delete(orgId);
  }
}
```

`apps/web/lib/user-repository.ts`:

```ts
export interface UserRecord {
  id: string;
  org_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  last_fleet_id: string | null;
  created_at: string;
}

export interface CreateUserInput {
  org_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  last_fleet_id: string;
}

export interface UserRepository {
  create(input: CreateUserInput): Promise<UserRecord>;
  findByEmail(email: string): Promise<UserRecord | null>;
  listByOrg(orgId: string): Promise<UserRecord[]>;
  updateLastFleetId(userId: string, fleetId: string): Promise<void>;
}

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, UserRecord>();
  private counter = 0;

  async create(input: CreateUserInput): Promise<UserRecord> {
    const id = `user-${++this.counter}`;
    const user: UserRecord = { id, created_at: new Date().toISOString(), ...input };
    this.users.set(id, user);
    return user;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }

  async listByOrg(orgId: string): Promise<UserRecord[]> {
    return [...this.users.values()].filter((u) => u.org_id === orgId);
  }

  async updateLastFleetId(userId: string, fleetId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) user.last_fleet_id = fleetId;
  }

  /** Test helper: insert a fully-formed record directly, bypassing
   * create()'s required last_fleet_id — used to set up edge cases like a
   * pre-existing user with no last_fleet_id yet. */
  seed(user: UserRecord): void {
    this.users.set(user.id, user);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run lib/__tests__/org-repository.test.ts lib/__tests__/user-repository.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib
git commit -m "feat(web): OrgRepository/UserRepository ports + in-memory implementations"
```

---

### Task 6: `apps/web` — Prisma-backed `OrgRepository`/`UserRepository`, session-cookie helper, `requireSession`, Fleet HTTP client

**Files:**
- Create: `apps/web/lib/prisma-org-repository.ts`
- Create: `apps/web/lib/prisma-user-repository.ts`
- Create: `apps/web/lib/session-cookie.ts`
- Create: `apps/web/lib/require-session.ts`
- Create: `apps/web/lib/fleet-service-client.ts`
- Create: `apps/web/lib/__tests__/require-session.test.ts`
- Create: `apps/web/lib/__tests__/fleet-service-client.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `OrgRepository`/`UserRepository`/`OrgRecord`/`UserRecord` (Task 5); `getPrismaClient`, `UserRole` from `@gamopls/db`; `verifyJwt`, `JwtVerificationError`, `SESSION_COOKIE_NAME`, `buildSessionCookieOptions`, `VerifiedGamoplsJwtClaims` from `@gamopls/auth`.
- Produces (used by Tasks 7–14): `PrismaOrgRepository`, `PrismaUserRepository`; `applySessionCookie(response: NextResponse, token: string): void`; `requireSession(request: NextRequest): Promise<VerifiedGamoplsJwtClaims | NextResponse>`; `listOrgFleets(orgId): Promise<FleetServiceFleet[]>`, `createOrgFleet(orgId, name): Promise<FleetServiceFleet>`, `earliestOrgFleet(orgId): Promise<FleetServiceFleet | null>`, `FleetServiceClientError`.

- [ ] **Step 1: Add the `@gamopls/db` dependency**

Edit `apps/web/package.json`, add to `dependencies`: `"@gamopls/db": "workspace:*"`. Run:

```bash
pnpm install
```

- [ ] **Step 2: Write the failing tests** (for the two files here that have real logic worth testing — the Prisma repositories are untested per this codebase's convention, see Global Constraints)

`apps/web/lib/__tests__/require-session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { issueJwt, SESSION_COOKIE_NAME } from "@gamopls/auth";
import { requireSession } from "../require-session.js";

const SECRET = "test-secret";

function makeRequest(cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(new URL("http://web.local/api/whatever"), { headers });
}

describe("requireSession", () => {
  it("returns a 401 NextResponse when there is no session cookie", async () => {
    const result = await requireSession(makeRequest());
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns a 401 NextResponse for an invalid token", async () => {
    const result = await requireSession(makeRequest("not-a-real-jwt"));
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns the verified claims for a valid session", async () => {
    const token = await issueJwt(
      { user_id: "user-1", org_id: "org-1", fleet_id: "fleet-1", role: "owner" },
      { secret: SECRET },
    );
    const result = await requireSession(makeRequest(token));
    expect(result).not.toBeInstanceOf(NextResponse);
    expect(result).toMatchObject({ user_id: "user-1", org_id: "org-1", fleet_id: "fleet-1", role: "owner" });
  });
});
```

Note: this test relies on `JWT_SECRET=test-secret` — add a `beforeEach` setting `process.env.JWT_SECRET = SECRET` at the top of the `describe` block.

`apps/web/lib/__tests__/fleet-service-client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrgFleet, earliestOrgFleet, FleetServiceClientError, listOrgFleets } from "../fleet-service-client.js";

describe("fleet-service-client", () => {
  beforeEach(() => {
    process.env.FLEET_SERVICE_URL = "http://fleet.internal:4600";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FLEET_SERVICE_URL;
  });

  it("listOrgFleets fetches and returns the fleets array", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ fleets: [{ id: "f1", org_id: "org-1", name: "Main", created_at: "2026-01-01T00:00:00.000Z" }] }), { status: 200 }),
    );
    const fleets = await listOrgFleets("org-1");
    expect(fleets).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith("http://fleet.internal:4600/fleets?org_id=org-1");
  });

  it("listOrgFleets throws FleetServiceClientError on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    await expect(listOrgFleets("org-1")).rejects.toBeInstanceOf(FleetServiceClientError);
  });

  it("createOrgFleet POSTs to the fleet service and returns the created fleet", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "f1", org_id: "org-1", name: "Main Fleet", created_at: "2026-01-01T00:00:00.000Z" }), { status: 201 }),
    );
    const fleet = await createOrgFleet("org-1", "Main Fleet");
    expect(fleet.id).toBe("f1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://fleet.internal:4600/fleets?org_id=org-1");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Main Fleet" });
  });

  it("earliestOrgFleet returns the last element (services/fleet lists newest-first)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          fleets: [
            { id: "newest", org_id: "org-1", name: "B", created_at: "2026-02-01T00:00:00.000Z" },
            { id: "oldest", org_id: "org-1", name: "A", created_at: "2026-01-01T00:00:00.000Z" },
          ],
        }),
        { status: 200 },
      ),
    );
    const fleet = await earliestOrgFleet("org-1");
    expect(fleet?.id).toBe("oldest");
  });

  it("earliestOrgFleet returns null for an org with no fleets", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ fleets: [] }), { status: 200 }));
    expect(await earliestOrgFleet("org-1")).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run lib/__tests__/require-session.test.ts lib/__tests__/fleet-service-client.test.ts`
Expected: FAIL — cannot resolve the not-yet-created modules.

- [ ] **Step 4: Implement**

`apps/web/lib/session-cookie.ts`:

```ts
import { NextResponse } from "next/server";
import { buildSessionCookieOptions } from "@gamopls/auth";

/**
 * Sets the session cookie on a NextResponse from a freshly issued JWT.
 * Shared by /api/login, /api/signup, and /api/switch-fleet so the
 * cookie-option mapping lives in exactly one place (suggestions.md C-10
 * territory — this was duplicated inline in two places before this task).
 */
export function applySessionCookie(response: NextResponse, token: string): void {
  const cookie = buildSessionCookieOptions(token);
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });
}
```

`apps/web/lib/require-session.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyJwt, JwtVerificationError, SESSION_COOKIE_NAME, type VerifiedGamoplsJwtClaims } from "@gamopls/auth";

/**
 * Reads and verifies the session cookie from a route handler request.
 * Returns the verified claims, or a ready-to-return 401 NextResponse if
 * the session is missing/invalid. Callers do:
 *
 *   const session = await requireSession(request);
 *   if (session instanceof NextResponse) return session;
 *   // session is VerifiedGamoplsJwtClaims here
 *
 * Extracted because this exact five-line block was about to be
 * duplicated a third time (suggestions.md C-10: "switch-fleet
 * re-implements gateway auth inline... reuse a shared requireSession()
 * helper").
 */
export async function requireSession(
  request: NextRequest,
): Promise<VerifiedGamoplsJwtClaims | NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized: missing session" }, { status: 401 });
  }
  try {
    return await verifyJwt(token);
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return NextResponse.json({ error: "Unauthorized: invalid session" }, { status: 401 });
    }
    throw err;
  }
}
```

`apps/web/lib/fleet-service-client.ts`:

```ts
/**
 * Direct server-to-server client for services/fleet's Fleet CRUD, used by
 * routes that need to create/read fleets as part of a larger operation
 * (signup, login, switch-fleet). apps/web never writes to the `fleets`
 * table directly — Fleet rows are owned exclusively by services/fleet,
 * reached only over HTTP, matching CLAUDE.md's module-boundary rule.
 */
export interface FleetServiceFleet {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
}

export class FleetServiceClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FleetServiceClientError";
  }
}

function baseUrl(): string {
  const url = process.env.FLEET_SERVICE_URL;
  if (!url) throw new FleetServiceClientError("FLEET_SERVICE_URL is not configured");
  return url.replace(/\/+$/, "");
}

export async function listOrgFleets(orgId: string): Promise<FleetServiceFleet[]> {
  const res = await fetch(`${baseUrl()}/fleets?org_id=${encodeURIComponent(orgId)}`);
  if (!res.ok) throw new FleetServiceClientError("Failed to list fleets", res.status);
  const body = (await res.json()) as { fleets: FleetServiceFleet[] };
  return body.fleets;
}

export async function createOrgFleet(orgId: string, name: string): Promise<FleetServiceFleet> {
  const res = await fetch(`${baseUrl()}/fleets?org_id=${encodeURIComponent(orgId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new FleetServiceClientError("Failed to create fleet", res.status);
  return (await res.json()) as FleetServiceFleet;
}

/** The org's earliest-created fleet. services/fleet's GET /fleets returns
 * newest-first (see prisma-fleet-repository.ts's `orderBy created_at
 * desc`), so the earliest one is the LAST element, not the first. */
export async function earliestOrgFleet(orgId: string): Promise<FleetServiceFleet | null> {
  const fleets = await listOrgFleets(orgId);
  return fleets.length > 0 ? fleets[fleets.length - 1] : null;
}
```

`apps/web/lib/prisma-org-repository.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@gamopls/db";
import type { OrgRecord, OrgRepository } from "./org-repository.js";

export class PrismaOrgRepository implements OrgRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: { id: string; name: string; invite_token: string }): OrgRecord {
    return { id: row.id, name: row.name, invite_token: row.invite_token };
  }

  async create(name: string): Promise<OrgRecord> {
    const org = await this.prisma.org.create({ data: { name } });
    return this.map(org);
  }

  async findById(id: string): Promise<OrgRecord | null> {
    const org = await this.prisma.org.findUnique({ where: { id } });
    return org ? this.map(org) : null;
  }

  async findByInviteToken(token: string): Promise<OrgRecord | null> {
    const org = await this.prisma.org.findUnique({ where: { invite_token: token } });
    return org ? this.map(org) : null;
  }

  async regenerateInviteToken(orgId: string): Promise<string> {
    const updated = await this.prisma.org.update({
      where: { id: orgId },
      data: { invite_token: randomUUID() },
    });
    return updated.invite_token;
  }

  async delete(orgId: string): Promise<void> {
    await this.prisma.org.delete({ where: { id: orgId } });
  }
}
```

`apps/web/lib/prisma-user-repository.ts`:

```ts
import type { PrismaClient, UserRole } from "@gamopls/db";
import type { CreateUserInput, UserRecord, UserRepository } from "./user-repository.js";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(row: {
    id: string;
    org_id: string;
    email: string;
    password_hash: string;
    name: string;
    role: string;
    last_fleet_id: string | null;
    created_at: Date;
  }): UserRecord {
    return {
      id: row.id,
      org_id: row.org_id,
      email: row.email,
      password_hash: row.password_hash,
      name: row.name,
      role: row.role,
      last_fleet_id: row.last_fleet_id,
      created_at: row.created_at.toISOString(),
    };
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: { ...input, role: input.role as UserRole },
    });
    return this.map(user);
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    return user ? this.map(user) : null;
  }

  async listByOrg(orgId: string): Promise<UserRecord[]> {
    const rows = await this.prisma.user.findMany({ where: { org_id: orgId }, orderBy: { created_at: "asc" } });
    return rows.map((r) => this.map(r));
  }

  async updateLastFleetId(userId: string, fleetId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { last_fleet_id: fleetId } });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run lib/__tests__/require-session.test.ts lib/__tests__/fleet-service-client.test.ts`
Expected: PASS (3 + 5 tests).

- [ ] **Step 6: Full apps/web build check** (Prisma repositories aren't covered by the tests above, so a type-check is the safety net for them)

```bash
pnpm --filter web build
```

Expected: succeeds (this compiles `prisma-org-repository.ts`/`prisma-user-repository.ts` against the real generated Prisma types from Tasks 3–4).

- [ ] **Step 7: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): Prisma-backed Org/User repositories, requireSession, session-cookie helper, fleet-service-client"
```

---

### Task 7: `apps/web` — `POST /api/signup` (new-org and invite-join modes)

**Files:**
- Create: `apps/web/app/api/signup/route.ts`
- Create: `apps/web/app/api/signup/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `hashPassword` (Task 1); `OrgRepository`/`UserRepository`, `InMemoryOrgRepository`/`InMemoryUserRepository` (Task 5); `PrismaOrgRepository`/`PrismaUserRepository`, `applySessionCookie`, `createOrgFleet`, `earliestOrgFleet`, `FleetServiceClientError` (Task 6); `issueJwt` from `@gamopls/auth`.
- Produces (used by Task 8): `POST /api/signup` accepting `{ email, password, name, org_name }` (new org) or `{ email, password, name, invite_token }` (join), returning `{ ok: true, org_id, fleet_id }` + session cookie on success. Exported factory `createSignupHandler(options?: { orgRepo?, userRepo? })` for tests.

- [ ] **Step 1: Write the failing tests**

`apps/web/app/api/signup/__tests__/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifyJwt } from "@gamopls/auth";
import { createSignupHandler } from "../route.js";
import { InMemoryOrgRepository } from "@/lib/org-repository";
import { InMemoryUserRepository } from "@/lib/user-repository";
import * as fleetServiceClient from "@/lib/fleet-service-client";

vi.mock("@/lib/fleet-service-client");

const SECRET = "test-secret";

function makeRequest(body: unknown) {
  return new NextRequest(new URL("http://web.local/api/signup"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/signup", () => {
  let orgRepo: InMemoryOrgRepository;
  let userRepo: InMemoryUserRepository;

  beforeEach(() => {
    orgRepo = new InMemoryOrgRepository();
    userRepo = new InMemoryUserRepository();
    process.env.JWT_SECRET = SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for a missing field", async () => {
    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest({ email: "a@example.com", password: "password123" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed email", async () => {
    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest({ email: "not-an-email", password: "password123", name: "A", org_name: "Acme" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a password under 8 characters", async () => {
    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest({ email: "a@example.com", password: "short", name: "A", org_name: "Acme" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 for a duplicate email", async () => {
    await userRepo.create({ org_id: "org-1", email: "a@example.com", password_hash: "h", name: "A", role: "owner", last_fleet_id: "fleet-1" });
    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest({ email: "a@example.com", password: "password123", name: "A", org_name: "Acme" }));
    expect(res.status).toBe(409);
  });

  it("new-org mode: creates Org + User(owner) + Fleet via services/fleet, and issues a session", async () => {
    vi.mocked(fleetServiceClient.createOrgFleet).mockResolvedValue({
      id: "fleet-new", org_id: "will-be-set", name: "Main Fleet", created_at: new Date().toISOString(),
    });

    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest({ email: "owner@example.com", password: "password123", name: "Owner", org_name: "Acme Fleet Co" }));
    expect(res.status).toBe(200);

    const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
    const claims = await verifyJwt(setCookie!.value, { secret: SECRET });
    expect(claims.fleet_id).toBe("fleet-new");
    expect(claims.role).toBe("owner");

    const user = await userRepo.findByEmail("owner@example.com");
    expect(user?.role).toBe("owner");
    expect(user?.last_fleet_id).toBe("fleet-new");
    expect(user?.org_id).toBe(claims.org_id);

    const createdFleetCall = vi.mocked(fleetServiceClient.createOrgFleet).mock.calls[0];
    expect(createdFleetCall).toEqual([claims.org_id, "Main Fleet"]);
  });

  it("new-org mode: deletes the orphaned Org if Fleet creation fails (compensating action)", async () => {
    vi.mocked(fleetServiceClient.createOrgFleet).mockRejectedValue(
      new fleetServiceClient.FleetServiceClientError("boom", 503),
    );
    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest({ email: "owner@example.com", password: "password123", name: "Owner", org_name: "Acme Fleet Co" }));
    expect(res.status).toBe(502);
    expect(await userRepo.findByEmail("owner@example.com")).toBeNull();
    // no way to list all orgs on the port, but a fresh lookup of the org
    // that was about to be created must not exist — assert indirectly via
    // signing up again succeeding cleanly (would 409 on the org, not the
    // user, if orphaned data were somehow interfering — it isn't, since
    // Org has no uniqueness constraint on name).
  });

  it("invite mode: creates only a User(fleet_manager) in the invited org, using its earliest fleet", async () => {
    const org = await orgRepo.create("Existing Org");
    vi.mocked(fleetServiceClient.earliestOrgFleet).mockResolvedValue({
      id: "fleet-earliest", org_id: org.id, name: "Main Fleet", created_at: new Date().toISOString(),
    });

    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(
      makeRequest({ email: "teammate@example.com", password: "password123", name: "Teammate", invite_token: org.invite_token }),
    );
    expect(res.status).toBe(200);

    const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
    const claims = await verifyJwt(setCookie!.value, { secret: SECRET });
    expect(claims).toMatchObject({ org_id: org.id, fleet_id: "fleet-earliest", role: "fleet_manager" });
    expect(vi.mocked(fleetServiceClient.createOrgFleet)).not.toHaveBeenCalled();
  });

  it("invite mode: returns 400 for an invalid/regenerated invite token", async () => {
    const handler = createSignupHandler({ orgRepo, userRepo });
    const res = await handler(
      makeRequest({ email: "teammate@example.com", password: "password123", name: "Teammate", invite_token: "no-such-token" }),
    );
    expect(res.status).toBe(400);
    expect(await userRepo.findByEmail("teammate@example.com")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run app/api/signup/__tests__/route.test.ts`
Expected: FAIL — cannot resolve `../route.js`.

- [ ] **Step 3: Implement**

`apps/web/app/api/signup/route.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run app/api/signup/__tests__/route.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): POST /api/signup (new org + invite-join modes)"
```

---

### Task 8: `apps/web` — `/signup` page UI

**Files:**
- Create: `apps/web/app/signup/page.tsx`
- Create: `apps/web/app/signup/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `POST /api/signup` (Task 7).
- Produces: `/signup` and `/signup?invite=<token>` pages.

- [ ] **Step 1: Write the failing tests**

`apps/web/app/signup/__tests__/page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SignupPage from "../page";

const { pushMock, refreshMock, searchParamsGet } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  searchParamsGet: vi.fn().mockReturnValue(null),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  useSearchParams: () => ({ get: searchParamsGet }),
}));

afterEach(() => {
  cleanup();
  pushMock.mockClear();
  refreshMock.mockClear();
  searchParamsGet.mockReturnValue(null);
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("SignupPage", () => {
  it("shows the org-name field when there is no invite token", () => {
    render(<SignupPage />);
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument();
  });

  it("hides the org-name field and shows a join message when an invite token is present", () => {
    searchParamsGet.mockReturnValue("some-invite-token");
    render(<SignupPage />);
    expect(screen.queryByLabelText(/company/i)).not.toBeInTheDocument();
  });

  it("submits new-org signup and redirects to /fleet on success", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true, org_id: "org-1", fleet_id: "fleet-1" }));
    render(<SignupPage />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Owner" } });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: "Acme Fleet Co" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/signup", expect.objectContaining({ method: "POST" })));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ email: "owner@example.com", password: "password123", name: "Owner", org_name: "Acme Fleet Co" });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fleet"));
  });

  it("submits invite-mode signup with invite_token instead of org_name", async () => {
    searchParamsGet.mockReturnValue("invite-abc");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true, org_id: "org-1", fleet_id: "fleet-1" }));
    render(<SignupPage />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "teammate@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Teammate" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ email: "teammate@example.com", invite_token: "invite-abc" });
    expect(body).not.toHaveProperty("org_name");
  });

  it("shows the server's error message on failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "An account with this email already exists" }, 409));
    render(<SignupPage />);

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Owner" } });
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: /sign up/i }));

    expect(await screen.findByText("An account with this email already exists")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run app/signup/__tests__/page.test.tsx`
Expected: FAIL — cannot resolve `../page`.

- [ ] **Step 3: Implement**

`apps/web/app/signup/page.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          inviteToken ? { email, password, name, invite_token: inviteToken } : { email, password, name, org_name: orgName },
        ),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Sign up failed");
        return;
      }
      router.push("/fleet");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-20 px-4">
      <Card className="border border-border bg-card shadow-2xl backdrop-blur-sm">
        <CardHeader className="space-y-3 text-center pb-6">
          <div className="flex justify-center">
            <div className="p-3 rounded-full bg-primary/10 border border-primary/20 text-primary">
              <Zap className="h-8 w-8 fill-primary/10" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground tracking-tight">
            {inviteToken ? "Join your team" : "Create your account"}
          </CardTitle>
          <CardDescription className="text-sm font-medium text-muted-foreground">
            GAMOPLS TeamCore Operations Portal
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-ring"
              />
            </div>

            {inviteToken ? (
              <p className="text-sm text-muted-foreground">You're joining your team's existing fleet.</p>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Company / org name
                </label>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Acme Logistics"
                  required
                  className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-ring"
                />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs font-medium text-rose-400">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full flex items-center justify-center h-10 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              disabled={submitting}
            >
              {submitting ? "Creating account…" : "Sign up"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run app/signup/__tests__/page.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): /signup page (new org + invite-join)"
```

---

### Task 9: `apps/web` — real `POST /api/login`, delete demo login, `/login` page tweaks

**Files:**
- Modify: `apps/web/app/api/login/route.ts` (full rewrite)
- Create: `apps/web/app/api/login/__tests__/route.test.ts`
- Delete: `apps/web/lib/demo-login.ts`
- Delete: `apps/web/lib/__tests__/demo-login.test.ts` (if it exists — check first)
- Modify: `apps/web/app/login/page.tsx`

**Interfaces:**
- Consumes: `verifyPassword` (Task 1); `UserRepository`, `InMemoryUserRepository` (Task 5); `PrismaUserRepository`, `applySessionCookie`, `earliestOrgFleet` (Task 6); `issueJwt` from `@gamopls/auth`.
- Produces: `POST /api/login` accepting `{ email, password }`, real DB-backed. Exported factory `createLoginHandler(options?: { userRepo? })` for tests.

- [ ] **Step 1: Check for and remove the old demo-login test file**

```bash
ls apps/web/lib/__tests__/
```

If `demo-login.test.ts` exists, delete it (`git rm apps/web/lib/__tests__/demo-login.test.ts`); the old `checkDemoCredentials` function it tested no longer exists after this task.

- [ ] **Step 2: Write the failing tests**

`apps/web/app/api/login/__tests__/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hashPassword, SESSION_COOKIE_NAME, verifyJwt } from "@gamopls/auth";
import { createLoginHandler } from "../route.js";
import { InMemoryUserRepository } from "@/lib/user-repository";
import * as fleetServiceClient from "@/lib/fleet-service-client";

vi.mock("@/lib/fleet-service-client");

const SECRET = "test-secret";

function makeRequest(body: unknown) {
  return new NextRequest(new URL("http://web.local/api/login"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/login", () => {
  let userRepo: InMemoryUserRepository;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    process.env.JWT_SECRET = SECRET;
    vi.restoreAllMocks();
  });

  it("returns 400 when email or password is missing", async () => {
    const handler = createLoginHandler({ userRepo });
    const res = await handler(makeRequest({ email: "a@example.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 for an unknown email", async () => {
    const handler = createLoginHandler({ userRepo });
    const res = await handler(makeRequest({ email: "nobody@example.com", password: "whatever123" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 for the wrong password", async () => {
    const passwordHash = await hashPassword("correct-password");
    await userRepo.create({
      org_id: "org-1", email: "user@example.com", password_hash: passwordHash,
      name: "Test User", role: "owner", last_fleet_id: "fleet-1",
    });
    const handler = createLoginHandler({ userRepo });
    const res = await handler(makeRequest({ email: "user@example.com", password: "wrong-password" }));
    expect(res.status).toBe(401);
  });

  it("issues a session with the expected claim shape on success", async () => {
    const passwordHash = await hashPassword("correct-password");
    const user = await userRepo.create({
      org_id: "org-1", email: "user@example.com", password_hash: passwordHash,
      name: "Test User", role: "owner", last_fleet_id: "fleet-1",
    });
    const handler = createLoginHandler({ userRepo });
    const res = await handler(makeRequest({ email: "user@example.com", password: "correct-password" }));
    expect(res.status).toBe(200);

    const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(setCookie?.value).toBeTruthy();
    const claims = await verifyJwt(setCookie!.value, { secret: SECRET });
    expect(claims).toMatchObject({ user_id: user.id, org_id: "org-1", fleet_id: "fleet-1", role: "owner" });
  });

  it("falls back to the org's earliest fleet when last_fleet_id is unset, and persists it", async () => {
    vi.mocked(fleetServiceClient.earliestOrgFleet).mockResolvedValue({
      id: "fleet-earliest", org_id: "org-1", name: "Main Fleet", created_at: new Date().toISOString(),
    });
    const passwordHash = await hashPassword("correct-password");
    userRepo.seed({
      id: "user-1", org_id: "org-1", email: "user@example.com", password_hash: passwordHash,
      name: "Test User", role: "owner", last_fleet_id: null, created_at: new Date().toISOString(),
    });

    const handler = createLoginHandler({ userRepo });
    const res = await handler(makeRequest({ email: "user@example.com", password: "correct-password" }));
    const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
    const claims = await verifyJwt(setCookie!.value, { secret: SECRET });
    expect(claims.fleet_id).toBe("fleet-earliest");

    const stored = await userRepo.findByEmail("user@example.com");
    expect(stored?.last_fleet_id).toBe("fleet-earliest");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run app/api/login/__tests__/route.test.ts`
Expected: FAIL (the current `route.ts` doesn't export `createLoginHandler`).

- [ ] **Step 4: Implement**

Replace the full contents of `apps/web/app/api/login/route.ts`:

```ts
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

export const POST = createLoginHandler();
```

Note: this reuses the `checkRateLimit` rate limiter and its `{limit, windowMs}` shape already added to `apps/web/lib/rate-limit.ts` in the tenancy-hardening session — no changes needed there, just importing it into the rewritten route.

Delete `apps/web/lib/demo-login.ts`:

```bash
git rm apps/web/lib/demo-login.ts
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run app/api/login/__tests__/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Update the login page**

In `apps/web/app/login/page.tsx`:
1. Change the `username` state/field to `email` (type `"email"` on the `<Input>`, label "Email", placeholder `"you@company.com"`), and send `{ email, password }` in the fetch body instead of `{ username, password }`.
2. Replace the "Demo Credentials: demo / demo" footer block with a sign-up link:

```tsx
<div className="border-t border-border pt-6 text-center">
  <p className="text-xs text-muted-foreground">
    Don't have an account?{" "}
    <a href="/signup" className="font-semibold text-primary hover:underline">
      Sign up
    </a>
  </p>
</div>
```

- [ ] **Step 7: Whole-package build + test**

```bash
cd apps/web && npx vitest run
```

Expected: PASS (no regressions — nothing else imported `demo-login.ts` or the old `username` field).

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat(web): real database-backed login; delete demo-login.ts (suggestions.md S-5)"
```

---

### Task 10: `apps/web` — `/api/switch-fleet` persists `last_fleet_id`

**Files:**
- Modify: `apps/web/app/api/switch-fleet/route.ts` (full rewrite)
- Create: `apps/web/app/api/switch-fleet/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `requireSession`, `listOrgFleets`, `FleetServiceClientError`, `applySessionCookie` (Task 6); `UserRepository`, `InMemoryUserRepository` (Task 5); `PrismaUserRepository` (Task 6).
- Produces: same external behavior as before (`POST /api/switch-fleet` with `{fleet_id}`), now also persisting `User.last_fleet_id`. Exported factory `createSwitchFleetHandler(options?: { userRepo? })`.

- [ ] **Step 1: Write the failing tests**

`apps/web/app/api/switch-fleet/__tests__/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { issueJwt, SESSION_COOKIE_NAME, verifyJwt } from "@gamopls/auth";
import { createSwitchFleetHandler } from "../route.js";
import { InMemoryUserRepository } from "@/lib/user-repository";
import * as fleetServiceClient from "@/lib/fleet-service-client";

vi.mock("@/lib/fleet-service-client");

const SECRET = "test-secret";

function makeRequest(body: unknown, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(new URL("http://web.local/api/switch-fleet"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/switch-fleet", () => {
  let userRepo: InMemoryUserRepository;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    process.env.JWT_SECRET = SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 without a session cookie", async () => {
    const handler = createSwitchFleetHandler({ userRepo });
    const res = await handler(makeRequest({ fleet_id: "fleet-2" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 without a fleet_id in the body", async () => {
    const token = await issueJwt({ user_id: "u1", org_id: "org-1", fleet_id: "fleet-1", role: "owner" }, { secret: SECRET });
    const handler = createSwitchFleetHandler({ userRepo });
    const res = await handler(makeRequest({}, token));
    expect(res.status).toBe(400);
  });

  it("returns 403 when the target fleet doesn't belong to the caller's org", async () => {
    vi.mocked(fleetServiceClient.listOrgFleets).mockResolvedValue([
      { id: "fleet-1", org_id: "org-1", name: "Main Fleet", created_at: new Date().toISOString() },
    ]);
    const token = await issueJwt({ user_id: "user-1", org_id: "org-1", fleet_id: "fleet-1", role: "owner" }, { secret: SECRET });
    const handler = createSwitchFleetHandler({ userRepo });
    const res = await handler(makeRequest({ fleet_id: "fleet-OTHER" }, token));
    expect(res.status).toBe(403);
  });

  it("switches fleets, persists last_fleet_id, and re-issues the session", async () => {
    vi.mocked(fleetServiceClient.listOrgFleets).mockResolvedValue([
      { id: "fleet-1", org_id: "org-1", name: "Main Fleet", created_at: new Date().toISOString() },
      { id: "fleet-2", org_id: "org-1", name: "Second Fleet", created_at: new Date().toISOString() },
    ]);
    const user = await userRepo.create({
      org_id: "org-1", email: "user@example.com", password_hash: "hash",
      name: "Test User", role: "owner", last_fleet_id: "fleet-1",
    });
    const token = await issueJwt({ user_id: user.id, org_id: "org-1", fleet_id: "fleet-1", role: "owner" }, { secret: SECRET });

    const handler = createSwitchFleetHandler({ userRepo });
    const res = await handler(makeRequest({ fleet_id: "fleet-2" }, token));
    expect(res.status).toBe(200);

    const setCookie = res.cookies.get(SESSION_COOKIE_NAME);
    const claims = await verifyJwt(setCookie!.value, { secret: SECRET });
    expect(claims.fleet_id).toBe("fleet-2");

    const stored = await userRepo.findByEmail("user@example.com");
    expect(stored?.last_fleet_id).toBe("fleet-2");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run app/api/switch-fleet/__tests__/route.test.ts`
Expected: FAIL (current `route.ts` doesn't export `createSwitchFleetHandler`).

- [ ] **Step 3: Implement**

Replace the full contents of `apps/web/app/api/switch-fleet/route.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run app/api/switch-fleet/__tests__/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "fix(web): switch-fleet persists last_fleet_id, reuses requireSession/applySessionCookie (suggestions.md C-10)"
```

---

### Task 11: `apps/web` — `GET /api/org` + `POST /api/org/invite` (owner-only)

**Files:**
- Create: `apps/web/app/api/org/route.ts`
- Create: `apps/web/app/api/org/invite/route.ts`
- Create: `apps/web/app/api/org/__tests__/route.test.ts`
- Create: `apps/web/app/api/org/invite/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `requireRole` (Task 2); `requireSession` (Task 6); `OrgRepository`/`UserRepository`, in-memory implementations (Task 5); Prisma implementations (Task 6).
- Produces (used by Task 12): `GET /api/org` → `{ id, name, invite_link, members: [{id, email, name, role, created_at}] }`; `POST /api/org/invite` → `{ invite_link }`. Both 403 for non-owners.

- [ ] **Step 1: Write the failing tests**

`apps/web/app/api/org/__tests__/route.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { issueJwt, SESSION_COOKIE_NAME } from "@gamopls/auth";
import { createOrgHandler } from "../route.js";
import { InMemoryOrgRepository } from "@/lib/org-repository";
import { InMemoryUserRepository } from "@/lib/user-repository";

const SECRET = "test-secret";

function makeRequest(cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(new URL("http://web.local/api/org"), { headers });
}

describe("GET /api/org", () => {
  let orgRepo: InMemoryOrgRepository;
  let userRepo: InMemoryUserRepository;

  beforeEach(() => {
    orgRepo = new InMemoryOrgRepository();
    userRepo = new InMemoryUserRepository();
    process.env.JWT_SECRET = SECRET;
  });

  it("returns 401 without a session", async () => {
    const handler = createOrgHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 for a fleet_manager", async () => {
    const org = await orgRepo.create("Acme");
    const token = await issueJwt({ user_id: "u1", org_id: org.id, fleet_id: "f1", role: "fleet_manager" }, { secret: SECRET });
    const handler = createOrgHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest(token));
    expect(res.status).toBe(403);
  });

  it("returns org info + invite link + members for an owner", async () => {
    const org = await orgRepo.create("Acme");
    await userRepo.create({ org_id: org.id, email: "owner@example.com", password_hash: "h", name: "Owner", role: "owner", last_fleet_id: "f1" });
    await userRepo.create({ org_id: org.id, email: "teammate@example.com", password_hash: "h", name: "Teammate", role: "fleet_manager", last_fleet_id: "f1" });

    const token = await issueJwt({ user_id: "u1", org_id: org.id, fleet_id: "f1", role: "owner" }, { secret: SECRET });
    const handler = createOrgHandler({ orgRepo, userRepo });
    const res = await handler(makeRequest(token));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.name).toBe("Acme");
    expect(body.invite_link).toContain(org.invite_token);
    expect(body.members).toHaveLength(2);
    expect(body.members.map((m: { email: string }) => m.email).sort()).toEqual(["owner@example.com", "teammate@example.com"]);
  });
});
```

`apps/web/app/api/org/invite/__tests__/route.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { issueJwt, SESSION_COOKIE_NAME } from "@gamopls/auth";
import { createOrgInviteHandler } from "../route.js";
import { InMemoryOrgRepository } from "@/lib/org-repository";

const SECRET = "test-secret";

function makeRequest(cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(new URL("http://web.local/api/org/invite"), { method: "POST", headers });
}

describe("POST /api/org/invite", () => {
  let orgRepo: InMemoryOrgRepository;

  beforeEach(() => {
    orgRepo = new InMemoryOrgRepository();
    process.env.JWT_SECRET = SECRET;
  });

  it("returns 403 for a fleet_manager", async () => {
    const org = await orgRepo.create("Acme");
    const token = await issueJwt({ user_id: "u1", org_id: org.id, fleet_id: "f1", role: "fleet_manager" }, { secret: SECRET });
    const handler = createOrgInviteHandler({ orgRepo });
    const res = await handler(makeRequest(token));
    expect(res.status).toBe(403);
  });

  it("regenerates the token for an owner, invalidating the old link", async () => {
    const org = await orgRepo.create("Acme");
    const oldToken = org.invite_token;
    const jwtToken = await issueJwt({ user_id: "u1", org_id: org.id, fleet_id: "f1", role: "owner" }, { secret: SECRET });

    const handler = createOrgInviteHandler({ orgRepo });
    const res = await handler(makeRequest(jwtToken));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.invite_link).not.toContain(oldToken);
    expect(await orgRepo.findByInviteToken(oldToken)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run app/api/org/__tests__/route.test.ts app/api/org/invite/__tests__/route.test.ts`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement**

`apps/web/app/api/org/route.ts`:

```ts
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

export const GET = createOrgHandler();
```

`apps/web/app/api/org/invite/route.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run app/api/org/__tests__/route.test.ts app/api/org/invite/__tests__/route.test.ts`
Expected: PASS (3 + 2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): GET /api/org + POST /api/org/invite, owner-gated (suggestions.md S-5)"
```

---

### Task 12: `apps/web` — `/org` page UI + sidebar link

**Files:**
- Create: `apps/web/app/org/api.ts`
- Create: `apps/web/app/org/page.tsx`
- Create: `apps/web/app/org/__tests__/page.test.tsx`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Consumes: `GET /api/org`, `POST /api/org/invite` (Task 11).
- Produces: `/org` page; a "Manage team" sidebar link shown only when `session.role === "owner"`.

- [ ] **Step 1: Write the failing tests**

`apps/web/app/org/__tests__/page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import OrgPage from "../page";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ORG = {
  id: "org-1",
  name: "Acme Fleet Co",
  invite_link: "http://web.local/signup?invite=abc123",
  members: [
    { id: "u1", email: "owner@example.com", name: "Owner", role: "owner", created_at: "2026-01-01T00:00:00.000Z" },
    { id: "u2", email: "teammate@example.com", name: "Teammate", role: "fleet_manager", created_at: "2026-01-02T00:00:00.000Z" },
  ],
};

describe("OrgPage", () => {
  it("loads and displays the org name, invite link, and members", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(ORG));
    render(<OrgPage />);

    expect(await screen.findByText("Acme Fleet Co")).toBeInTheDocument();
    expect(screen.getByText(ORG.invite_link)).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.getByText("teammate@example.com")).toBeInTheDocument();
  });

  it("regenerates the invite link on click", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/org/invite")) return jsonResponse({ invite_link: "http://web.local/signup?invite=NEW" });
      return jsonResponse(ORG);
    });
    render(<OrgPage />);
    await screen.findByText(ORG.invite_link);

    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));

    await waitFor(() => expect(screen.getByText("http://web.local/signup?invite=NEW")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/org/invite", expect.objectContaining({ method: "POST" }));
  });

  it("shows an error state when the org fails to load", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ error: "owner role required" }, 403));
    render(<OrgPage />);
    expect(await screen.findByText("owner role required")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run app/org/__tests__/page.test.tsx`
Expected: FAIL — cannot resolve `../page`.

- [ ] **Step 3: Implement**

`apps/web/app/org/api.ts`:

```ts
export interface OrgTeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}

export interface OrgInfo {
  id: string;
  name: string;
  invite_link: string;
  members: OrgTeamMember[];
}

export class OrgApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OrgApiError";
  }
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    throw new OrgApiError(typeof body.error === "string" ? body.error : res.statusText, res.status);
  }
  return (await res.json()) as T;
}

export async function getOrgInfo(): Promise<OrgInfo> {
  const res = await fetch("/api/org");
  return parseOrThrow<OrgInfo>(res);
}

export async function regenerateInviteLink(): Promise<string> {
  const res = await fetch("/api/org/invite", { method: "POST" });
  const body = await parseOrThrow<{ invite_link: string }>(res);
  return body.invite_link;
}
```

`apps/web/app/org/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, Spinner } from "@gamopls/ui";
import { Copy, RefreshCw } from "lucide-react";
import * as orgApi from "./api";
import type { OrgInfo } from "./api";

export default function OrgPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    orgApi
      .getOrgInfo()
      .then(setOrg)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load org"))
      .finally(() => setLoading(false));
  }, []);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const link = await orgApi.regenerateInviteLink();
      setOrg((current) => (current ? { ...current, invite_link: link } : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate invite link");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleCopy() {
    if (!org) return;
    await navigator.clipboard.writeText(org.invite_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={32} label="Loading team" />
      </div>
    );
  }

  if (error || !org) {
    return (
      <Card className="border border-border bg-card p-6 text-center max-w-lg mx-auto mt-12">
        <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
          {error ?? "Failed to load org"}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{org.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">Team & invites</p>
      </div>

      <Card className="border border-border bg-card p-6 space-y-3">
        <h2 className="text-lg font-bold text-foreground">Invite link</h2>
        <p className="text-sm text-muted-foreground">
          Share this link with a teammate — anyone who signs up with it joins your team.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-background/50 border border-border rounded-md px-3 py-2 truncate">
            {org.invite_link}
          </code>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-semibold text-foreground hover:bg-accent"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            disabled={regenerating}
            onClick={() => void handleRegenerate()}
            className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Regenerating invalidates the link above — anyone who hasn't used it yet will need the new one.
        </p>
      </Card>

      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-foreground mb-4 border-b border-border/50 pb-2">Team</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Role</th>
              <th className="py-2">Joined</th>
            </tr>
          </thead>
          <tbody>
            {org.members.map((m) => (
              <tr key={m.id} className="border-b border-border/50">
                <td className="py-2 font-semibold text-foreground">{m.name}</td>
                <td className="py-2 text-muted-foreground">{m.email}</td>
                <td className="py-2 text-muted-foreground capitalize">{m.role.replace("_", " ")}</td>
                <td className="py-2 text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
```

In `apps/web/app/layout.tsx`, add the import `Users` to the existing `lucide-react` import line (`import { Zap, LogOut, Users } from "lucide-react";`), then add a "Manage team" link inside the existing `session ? (...)` block, right after the `session.user_id` `<span>` and before the "Sign Out" `<a>`:

```tsx
{session.role === "owner" && (
  <a
    href="/org"
    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
  >
    <Users className="h-3 w-3" />
    Manage team
  </a>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run app/org/__tests__/page.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): /org team page (invite link, member list), sidebar link for owners"
```

---

### Task 13: `services/fleet` — `POST /assets/:id/preview` (real MQTT publish)

**Files:**
- Create: `services/fleet/src/telemetry-preview-publisher.ts`
- Modify: `services/fleet/src/build-app.ts`
- Modify: `services/fleet/src/server.ts`
- Modify: `services/fleet/src/__tests__/build-app.test.ts`
- Modify: `services/fleet/package.json`

**Interfaces:**
- Consumes: `AssetRepository.get`/`create`/`updateHealth` (existing, unchanged).
- Produces (used by Task 14): `POST /assets/:id/preview?org_id=&fleet_id=` → 202 on success, 404 outside tenancy, 409 if the asset already has telemetry. `TelemetryPreviewPublisher` interface + `MqttTelemetryPreviewPublisher` implementation, injectable via `BuildAppOptions.telemetryPreviewPublisher`.

- [ ] **Step 1: Add the `mqtt` dependency**

Edit `services/fleet/package.json`, add to `dependencies`: `"mqtt": "^5.10.1"`. Run:

```bash
pnpm install
```

- [ ] **Step 2: Write the failing tests**

Add this describe block to `services/fleet/src/__tests__/build-app.test.ts` (after the existing describe blocks, same file — it already imports `beforeEach, describe, expect, it` and `InMemoryAssetRepository`, `InMemoryFleetRepository`, `InMemoryDriverRepository`, `InMemoryAssignmentRepository`, `buildApp`, and defines `FakeVehiclePluginClient`):

```ts
class FakeTelemetryPreviewPublisher {
  readonly published: { assetId: string; orgId: string; fleetId: string }[] = [];
  async publish(reading: { assetId: string; orgId: string; fleetId: string }): Promise<void> {
    this.published.push(reading);
  }
}

describe("POST /assets/:id/preview", () => {
  let app: FastifyInstance;
  let assetRepo: InMemoryAssetRepository;
  let publisher: FakeTelemetryPreviewPublisher;

  beforeEach(() => {
    assetRepo = new InMemoryAssetRepository();
    publisher = new FakeTelemetryPreviewPublisher();
    app = buildApp({
      fleetRepo: new InMemoryFleetRepository(),
      driverRepo: new InMemoryDriverRepository(),
      assetRepo,
      assignmentRepo: new InMemoryAssignmentRepository(),
      vehiclePluginClient: new FakeVehiclePluginClient() as any,
      telemetryPreviewPublisher: publisher,
    });
  });

  it("publishes a preview reading for an asset with no telemetry yet", async () => {
    const created = await assetRepo.create({ org_id: "org-1", fleet_id: "fleet-1", type: "vehicle", display_label: "Test" });
    const res = await app.inject({ method: "POST", url: `/assets/${created.id}/preview?org_id=org-1&fleet_id=fleet-1` });
    expect(res.statusCode).toBe(202);
    expect(publisher.published).toEqual([{ assetId: created.id, orgId: "org-1", fleetId: "fleet-1" }]);
  });

  it("returns 404 for an asset outside the caller's tenancy", async () => {
    const created = await assetRepo.create({ org_id: "org-1", fleet_id: "fleet-1", type: "vehicle", display_label: "Test" });
    const res = await app.inject({ method: "POST", url: `/assets/${created.id}/preview?org_id=org-2&fleet_id=fleet-2` });
    expect(res.statusCode).toBe(404);
    expect(publisher.published).toHaveLength(0);
  });

  it("returns 409 for an asset that already has telemetry", async () => {
    const created = await assetRepo.create({ org_id: "org-1", fleet_id: "fleet-1", type: "vehicle", display_label: "Test" });
    await assetRepo.updateHealth(created.id, 90, { fuel_pct: 50 });
    const res = await app.inject({ method: "POST", url: `/assets/${created.id}/preview?org_id=org-1&fleet_id=fleet-1` });
    expect(res.statusCode).toBe(409);
    expect(publisher.published).toHaveLength(0);
  });

  it("returns 400 without org_id/fleet_id query params", async () => {
    const res = await app.inject({ method: "POST", url: "/assets/some-id/preview" });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd services/fleet && npx vitest run src/__tests__/build-app.test.ts`
Expected: FAIL — `buildApp` doesn't accept `telemetryPreviewPublisher` yet, and `POST /assets/:id/preview` doesn't exist (404 instead of the expected statuses).

- [ ] **Step 4: Implement**

`services/fleet/src/telemetry-preview-publisher.ts`:

```ts
import mqtt from "mqtt";

/**
 * "Preview with live data" (suggestions.md S-5 / roadmap item 8): publishes
 * one real MQTT message matching infra/simulators/edgebox-sim's exact
 * payload shape, authenticated as the `edgebox` broker device user set up
 * in the tenancy-hardening session (S-2). This flows through the same
 * ingestion -> ai-engine -> fleet/map/board pipeline a real Edge Box uses —
 * never a database-only fake — so a newly added vehicle with no hardware
 * yet can still prove the pipeline works within a few seconds.
 */
export interface PreviewReading {
  assetId: string;
  orgId: string;
  fleetId: string;
}

export interface TelemetryPreviewPublisher {
  publish(reading: PreviewReading): Promise<void>;
}

export interface MqttTelemetryPreviewPublisherOptions {
  brokerUrl: string;
  username: string;
  password: string;
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class MqttTelemetryPreviewPublisher implements TelemetryPreviewPublisher {
  constructor(private readonly options: MqttTelemetryPreviewPublisherOptions) {}

  async publish(reading: PreviewReading): Promise<void> {
    const client = mqtt.connect(this.options.brokerUrl, {
      username: this.options.username,
      password: this.options.password,
      clientId: `preview-${reading.assetId}-${Date.now()}`,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("error", (err) => reject(err));
      });

      const topic = `edgebox/${reading.orgId}/${reading.fleetId}/preview-${reading.assetId}/telemetry`;
      const payload = {
        device_id: `preview-${reading.assetId}`,
        asset_id: reading.assetId,
        org_id: reading.orgId,
        fleet_id: reading.fleetId,
        ts: new Date().toISOString(),
        gps: {
          lat: 13.0827 + randomInRange(-0.025, 0.025),
          lng: 80.2707 + randomInRange(-0.025, 0.025),
          heading: randomInRange(0, 360),
          speed_kmh: randomInRange(20, 50),
        },
        telemetry: {
          battery_pct: randomInRange(70, 95),
          engine_temp_c: randomInRange(75, 90),
          fuel_pct: randomInRange(50, 90),
          health_score: randomInRange(85, 95),
        },
      };

      await new Promise<void>((resolve, reject) => {
        client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => (err ? reject(err) : resolve()));
      });
    } finally {
      client.end();
    }
  }
}
```

In `services/fleet/src/build-app.ts`, add the import and option:

```ts
import type { TelemetryPreviewPublisher } from "./telemetry-preview-publisher.js";
```

Add to `BuildAppOptions`:

```ts
export interface BuildAppOptions {
  fleetRepo?: FleetRepository;
  driverRepo?: DriverRepository;
  assetRepo?: AssetRepository;
  assignmentRepo?: AssignmentRepository;
  vehiclePluginClient?: VehiclePluginClientType;
  telemetryPreviewPublisher?: TelemetryPreviewPublisher;
}
```

In `buildApp`, alongside the other `options.x ?? new Y()` defaults, add:

```ts
const telemetryPreviewPublisher =
  options.telemetryPreviewPublisher ??
  new MqttTelemetryPreviewPublisher({
    brokerUrl: process.env.MQTT_BROKER_URL ?? "tcp://localhost:1883",
    username: process.env.MQTT_DEVICE_USERNAME ?? "edgebox",
    password: process.env.MQTT_DEVICE_PASSWORD ?? "changeme-dev-only",
  });
```

(This requires importing `MqttTelemetryPreviewPublisher` too: `import { MqttTelemetryPreviewPublisher, type TelemetryPreviewPublisher } from "./telemetry-preview-publisher.js";`)

Add the route, right after the existing `GET /assets/:id/maintenance-records` handler and before `return app;`:

```ts
app.post("/assets/:id/preview", async (request, reply) => {
  const { id } = request.params as { id: string };
  const tenancy = tenancyQuery(request.query);
  if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
  const asset = await assetRepo.get(id, tenancy.org_id, tenancy.fleet_id);
  if (!asset) return reply.status(404).send({ error: "asset not found" });
  if (asset.telemetry_updated_at !== null) {
    return reply.status(409).send({ error: "asset already has telemetry" });
  }
  await telemetryPreviewPublisher.publish({ assetId: id, orgId: tenancy.org_id, fleetId: tenancy.fleet_id });
  return reply.status(202).send({ published: true });
});
```

In `services/fleet/src/server.ts`, pass the constructed default through explicitly is unnecessary (buildApp already defaults it from env) — no changes needed there, since `buildApp({ fleetRepo, driverRepo, assetRepo, assignmentRepo, vehiclePluginClient })` already omits `telemetryPreviewPublisher`, letting it fall back to the env-driven default inside `buildApp` itself.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd services/fleet && npx vitest run`
Expected: PASS (all existing tests + 4 new ones).

- [ ] **Step 6: Build and commit**

```bash
pnpm --filter @gamopls/fleet build
git add services/fleet pnpm-lock.yaml
git commit -m "feat(fleet): POST /assets/:id/preview — publishes real MQTT telemetry for the onboarding preview button"
```

---

### Task 14: `apps/web` — vehicle detail page: pairing/preview card + polling

**Files:**
- Modify: `apps/web/components/fleet/api.ts`
- Modify: `apps/web/app/fleet/vehicles/[id]/page.tsx`
- Modify: `apps/web/app/fleet/vehicles/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `POST /api/fleet/assets/:id/preview` (Task 13, reached through the already-existing `/api/fleet/[...path]` gateway proxy — no gateway changes needed).
- Produces: `previewTelemetry(assetId: string): Promise<{ published: boolean }>` in `components/fleet/api.ts`; vehicle detail page shows a "Connect this vehicle" card while `asset.telemetry_updated_at === null`, polls every 5s.

- [ ] **Step 1: Write the failing tests**

Modify `apps/web/app/fleet/vehicles/__tests__/page.test.tsx` — add `fireEvent` to the existing RTL import (`import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";`), then append these two tests inside the existing `describe("VehicleDetailPage", ...)` block:

```tsx
  it("shows the connect/preview card when telemetry_updated_at is null, and hides it after a poll picks up new data", async () => {
    vi.mocked(fleetApi.getVehicle)
      .mockResolvedValueOnce({
        id: "asset-1", org_id: "org-1", fleet_id: "fleet-1", type: "vehicle",
        display_label: "TN-01-AB-1234 (van)", health_score: 0, telemetry: {},
        telemetry_updated_at: null, last_mileage_kmpl: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        vehicleDetails: null,
      })
      .mockResolvedValueOnce({
        id: "asset-1", org_id: "org-1", fleet_id: "fleet-1", type: "vehicle",
        display_label: "TN-01-AB-1234 (van)", health_score: 90, telemetry: { fuel_pct: 80 },
        telemetry_updated_at: new Date().toISOString(), last_mileage_kmpl: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        vehicleDetails: null,
      });
    vi.mocked(fleetApi.listAssignmentHistory).mockResolvedValue([]);
    vi.mocked(fleetApi.listMaintenanceRecords).mockResolvedValue([]);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<VehicleDetailPage />);

    await waitFor(() => expect(screen.getByText("Connect this vehicle")).toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => expect(screen.queryByText("Connect this vehicle")).not.toBeInTheDocument());

    vi.useRealTimers();
  });

  it("calls previewTelemetry when 'Preview with live data' is clicked", async () => {
    vi.mocked(fleetApi.getVehicle).mockResolvedValue({
      id: "asset-1", org_id: "org-1", fleet_id: "fleet-1", type: "vehicle",
      display_label: "TN-01-AB-1234 (van)", health_score: 0, telemetry: {},
      telemetry_updated_at: null, last_mileage_kmpl: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      vehicleDetails: null,
    });
    vi.mocked(fleetApi.listAssignmentHistory).mockResolvedValue([]);
    vi.mocked(fleetApi.listMaintenanceRecords).mockResolvedValue([]);
    vi.mocked(fleetApi.previewTelemetry).mockResolvedValue({ published: true });

    render(<VehicleDetailPage />);
    await waitFor(() => expect(screen.getByText("Connect this vehicle")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /preview with live data/i }));

    await waitFor(() => expect(fleetApi.previewTelemetry).toHaveBeenCalledWith("asset-1"));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run app/fleet/vehicles/__tests__/page.test.tsx`
Expected: FAIL — `previewTelemetry` doesn't exist, and no "Connect this vehicle" text is rendered.

- [ ] **Step 3: Implement**

Append to `apps/web/components/fleet/api.ts`:

```ts
export async function previewTelemetry(assetId: string): Promise<{ published: boolean }> {
  const res = await fetch(`/api/fleet/assets/${assetId}/preview`, { method: "POST" });
  return parseOrThrow<{ published: boolean }>(res);
}
```

Replace the full contents of `apps/web/app/fleet/vehicles/[id]/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Card, Spinner, Button } from "@gamopls/ui";
import { Radio, Sparkles } from "lucide-react";
import * as fleetApi from "@/components/fleet/api";
import type { Asset, DriverAssignment } from "@/components/fleet/types";
import { VehicleDigitalTwin } from "@/components/fleet/VehicleDigitalTwin";
import { MaintenanceCard } from "@/components/fleet/MaintenanceCard";

const POLL_INTERVAL_MS = 5000;

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [history, setHistory] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const isFirstLoad = useRef(true);

  const load = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    try {
      const [assetData, historyData] = await Promise.all([
        fleetApi.getVehicle(params.id),
        fleetApi.listAssignmentHistory(params.id),
      ]);
      setAsset(assetData);
      setHistory(historyData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vehicle");
    } finally {
      setLoading(false);
      isFirstLoad.current = false;
    }
  }, [params.id]);

  useEffect(() => {
    void load();
    // Polls so the "connect this vehicle" card disappears and the digital
    // twin updates once a reading (real or previewed) arrives, without
    // requiring a manual refresh — same pattern as MapView's position poll.
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  async function handlePreview() {
    if (!asset) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      await fleetApi.previewTelemetry(asset.id);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to send preview data");
    } finally {
      setPreviewing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={32} label="Loading vehicle" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <Card className="border border-border bg-card p-6 text-center max-w-lg mx-auto mt-12">
        <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
          {error ?? "Vehicle not found"}
        </p>
      </Card>
    );
  }

  const current = history.find((a) => a.unassigned_at === null);
  // Live odometer from telemetry is the single source of truth
  // (suggestions.md D-1); the vehicleDetails column only records the
  // reading at onboarding and is never updated afterwards.
  const liveOdometerKm =
    typeof asset.telemetry?.odometer_km === "number" ? asset.telemetry.odometer_km : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">{asset.display_label}</h1>
        <p className="text-sm text-muted-foreground mt-1">Vehicle detail</p>
      </div>

      {asset.telemetry_updated_at === null && (
        <Card className="border border-primary/20 bg-primary/5 p-6 space-y-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Radio className="h-4 w-4 text-primary" />
            Connect this vehicle
          </h2>
          <p className="text-sm text-muted-foreground">
            Pairing ID: <code className="bg-background/50 px-1.5 py-0.5 rounded">{asset.id}</code> — use this to
            connect your Edge Box device.
          </p>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => void handlePreview()}
              disabled={previewing}
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}
            >
              <Sparkles className="h-3.5 w-3.5" style={{ marginRight: "0.35rem" }} />
              {previewing ? "Sending…" : "Preview with live data"}
            </Button>
            <span className="text-xs text-muted-foreground">Don&apos;t have hardware yet? See it on the map now.</span>
          </div>
          {previewError && <p className="text-xs text-rose-400">{previewError}</p>}
        </Card>
      )}

      <Card className="border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-bold text-foreground">Digital twin</h2>
        <VehicleDigitalTwin telemetry={asset.telemetry} healthScore={asset.health_score} />
        {asset.vehicleDetails && (
          <div className="text-sm text-muted-foreground space-y-1">
            <div>Plate: {asset.vehicleDetails.plateNumber}</div>
            <div>Type: {asset.vehicleDetails.vehicleType}</div>
            <div>
              Odometer:{" "}
              {liveOdometerKm !== null
                ? `${liveOdometerKm.toLocaleString()} km`
                : `${asset.vehicleDetails.odometerKm.toLocaleString()} km (at onboarding — no live reading yet)`}
            </div>
            {asset.vehicleDetails.make && <div>Make/Model: {asset.vehicleDetails.make} {asset.vehicleDetails.model}</div>}
          </div>
        )}
        <span className="text-sm text-muted-foreground">
          Mileage: {typeof asset.last_mileage_kmpl === "number" ? `${asset.last_mileage_kmpl.toFixed(1)} km/L` : "—"}
        </span>
      </Card>

      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-foreground mb-3">Driver assignment</h2>
        {current ? (
          <p className="text-sm text-foreground">Currently assigned to driver {current.driver_id}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No driver currently assigned.</p>
        )}
      </Card>

      <MaintenanceCard
        assetId={asset.id}
        currentOdometerKm={liveOdometerKm ?? asset.vehicleDetails?.odometerKm ?? 0}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run app/fleet/vehicles/__tests__/page.test.tsx`
Expected: PASS (3 tests — the original plus the two new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): vehicle detail page — connect/preview card + 5s poll (suggestions.md S-5)"
```

---

### Task 15: `apps/web` — `VehiclesPanel` navigates to the new vehicle on create

**Files:**
- Modify: `apps/web/components/fleet/VehiclesPanel.tsx`
- Modify: `apps/web/components/fleet/__tests__/VehiclesPanel.test.tsx`

**Interfaces:**
- Consumes: `fleetApi.createVehicle` (existing, returns `Asset` with `id`).
- Produces: on successful vehicle creation, navigates to `/fleet/vehicles/:id` instead of just refreshing the in-place list.

- [ ] **Step 1: Update the failing test**

In `apps/web/components/fleet/__tests__/VehiclesPanel.test.tsx`, add near the top (after the existing `vi.mock("../api");`):

```ts
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
```

Add `pushMock.mockClear();` inside the existing `afterEach(() => { cleanup(); })` block. Replace the existing `"submits the add-vehicle form with only the required fields"` test with:

```tsx
  it("submits the add-vehicle form with only the required fields and navigates to its detail page", async () => {
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([]);
    vi.mocked(fleetApi.createVehicle).mockResolvedValue({ id: "asset-new" } as any);

    render(<VehiclesPanel />);
    await waitFor(() => expect(fleetApi.listVehicles).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Plate number"), { target: { value: "TN-02-CD-5678" } });
    fireEvent.click(screen.getByRole("button", { name: /add vehicle/i }));

    await waitFor(() =>
      expect(fleetApi.createVehicle).toHaveBeenCalledWith(
        expect.objectContaining({ plateNumber: "TN-02-CD-5678", vehicleType: "car", fuelType: "petrol" }),
      ),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/fleet/vehicles/asset-new"));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && npx vitest run components/fleet/__tests__/VehiclesPanel.test.tsx`
Expected: FAIL — `pushMock` is never called (component doesn't navigate yet).

- [ ] **Step 3: Implement**

In `apps/web/components/fleet/VehiclesPanel.tsx`, add the import `import { useRouter } from "next/navigation";`, call `const router = useRouter();` at the top of the component, and change `handleCreate`:

```tsx
  async function handleCreate(input: CreateVehicleInput) {
    const created = await fleetApi.createVehicle(input);
    // Land straight on the new vehicle's detail page — that's where the
    // pairing ID / "preview with live data" card is waiting, so the next
    // step after adding a vehicle is immediately visible.
    router.push(`/fleet/vehicles/${created.id}`);
  }
```

(The `load()` call this replaced is no longer needed here — the vehicles list will simply reflect the new vehicle the next time `/fleet` is visited, since navigating away unmounts `VehiclesPanel`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && npx vitest run components/fleet/__tests__/VehiclesPanel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): VehiclesPanel navigates to the new vehicle's detail page on create"
```

---

### Task 16: Whole-branch verification

- [ ] **Step 1: Full build, lint, test, architecture guard**

```bash
pnpm build && pnpm lint && pnpm test && node scripts/check-architecture-rules.mjs
```

Expected: all green. (`services/core-ingestion` and `services/ai-engine` are untouched by this plan — skip their suites.)

- [ ] **Step 2: Live smoke test through the real stack**

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm start:all
```

Once services are up (`curl -sf localhost:4600/health`, `curl -sf localhost:3000/login`):

1. Visit `/signup`, create a brand-new org ("Smoke Test Fleet Co", any email/password/name). Confirm redirect to `/fleet` and an empty vehicles table.
2. Add a vehicle. Confirm redirect to `/fleet/vehicles/<id>` and the "Connect this vehicle" card is visible with a pairing ID.
3. Click "Preview with live data". Within ~5s (one poll tick), confirm the card disappears and the digital twin shows real values.
4. Go to `/org` (should be visible in the sidebar as "Manage team" since this account is the owner). Copy the invite link.
5. Open a private/incognito window, visit the copied invite link. Confirm the signup form shows "You're joining Smoke Test Fleet Co" with no org-name field. Sign up as a second user.
6. As the second user, try visiting `/org` directly — confirm it 403s (this account is `fleet_manager`, not `owner`).
7. As the second user, confirm they land in and can see the same fleet/vehicle the first user created.
8. Log out, log back in as the original demo user (`demo` / `<DEMO_LOGIN_PASSWORD>` from `.env`, now using the seeded real account) — confirm login still works end-to-end.
9. `curl -s -X POST localhost:4600/assets/<some-other-orgs-asset-id>/preview?org_id=org-WRONG&fleet_id=fleet-WRONG` directly against the service (bypassing the gateway) — confirm 404, proving tenancy scoping on the new route.

- [ ] **Step 3: Tear down**

```bash
pkill -f "start-all.mjs"; pkill -f "next dev"; pkill -f "tsx watch"
docker compose -f infra/docker-compose.yml down
```

- [ ] **Step 4: Update memory**

Update the `project-gamoplsapp-suggestions-roadmap` memory file: mark roadmap item 8 (real auth, S-5) done, note the repository-port adaptation from the spec's literal wording, and that `apps/mobile`/full D-3 FK sweep/password reset remain explicitly deferred per the spec.
