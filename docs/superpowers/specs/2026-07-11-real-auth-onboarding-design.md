# Real Auth & Frictionless Onboarding — Design

## Context

`suggestions.md` (2026-07-10 application review), NOW-tier roadmap item 8, flagged as **Critical (business)**: "A new customer cannot onboard at all. There is no signup, no org creation, no user store (login is a hardcoded demo credential from env vars), and no 'create fleet' UI... The `role` claim is carried everywhere and enforced nowhere."

Today, concretely:
- `apps/web/lib/demo-login.ts` checks one hardcoded username/password pair from env vars — there is no `User` row, ever.
- No `Org` table exists. `org_id` is a free string carried in the JWT (`"org-demo"`); `Fleet.org_id` is a plain `String` column, not a foreign key to anything.
- `role` is issued into the JWT and re-issued on fleet-switch, but `grep`ing the codebase shows it is never compared against anything — any authenticated session can do anything.
- The "+ New fleet" flow (wired last session) already lets a logged-in user create additional fleets, but there's still no way for a *new* customer to get a session in the first place.

This spec covers the piece of item 8 that's actually missing: real signup/login backed by a database, an org-scoped team/invite mechanism, and a low-friction path from "just signed up" to "seeing a vehicle live on the map." It deliberately does **not** cover the broader design-language/Overview-dashboard work (roadmap item 9) or the pagination/SSE/telemetry-history items (10–13) — those are independent sub-projects.

## Goals

1. A new visitor can sign up (email, password, name, company/org name) and land in a working, populated-with-nothing-but-usable app — no admin intervention, no waiting.
2. Login is a real, hashed-password check against a `User` row — the demo credential path is replaced, not left running in parallel.
3. An existing org's owner can bring a teammate in with **one link**, no email delivery infrastructure required.
4. The `role` claim starts meaning something: at least one real authorization check exists and is enforced at the gateway layer, matching how tenancy scope was centralized last session.
5. A freshly added vehicle with no telemetry yet gives the user an obvious, one-click way to see it come alive on the map — using the real ingestion pipeline, not a UI-only fake.
6. The existing JWT claim shape (`user_id`, `org_id`, `fleet_id`, `role`) and everything built on it last session (`@gamopls/auth`'s `verifyJwt`, the gateway, the `x-gamopls-scope` header, every service's `requireScope`) is **untouched**. This is a hard constraint, not a preference — re-deriving and re-testing that stack is out of scope here.

## Non-goals

- Password reset / forgot-password flow. No email-sending infrastructure exists anywhere in this repo (`suggestions.md` explicitly gates "WhatsApp/SMS delivery" as a *later* roadmap item); building one ESP integration just for this would be scope creep. Flagged for a future pass once the app has any outbound-email need.
- Per-invite tokens, expiry, or email-targeted invites. One regenerable org-wide link is enough for a team of the size this product targets today.
- Retrofitting `requireRole` onto existing board/chat/map mutation routes. There is no role-differentiated UI anywhere yet (no driver-facing screen exists — `apps/mobile` isn't started per `CLAUDE.md`), so there's nothing concrete to gate beyond the one real distinction this spec introduces (org/team management).
- Adding real foreign keys from `org_id`/`fleet_id` to `Org.id` across every table that carries them (`Asset`, `Mission`, `Driver`, `MissionChannel`, etc. — `suggestions.md` D-3's full scope). Only `Fleet.org_id → Org.id` gets a real FK here, because `Fleet` is the direct child of signup. The rest is a separate, larger migration touching every service's repository tests.
- Renaming an org or a fleet from the UI.
- Multi-org membership (one user belongs to exactly one org, matching "signup creates Org + first User").

## Architecture

All of this lives in `apps/web`'s existing route-handler layer, talking directly to Prisma via `@gamopls/db` — the same trust boundary `/api/login` already uses today. No new deployable service. `suggestions.md`'s own A-1 finding is that this repo already has too many processes for its actual scale; adding an "auth service" for what's fundamentally three route handlers and two Prisma models would make that worse, not better.

```
apps/web/app/api/signup/route.ts       — POST, creates Org+User+Fleet OR joins via invite
apps/web/app/api/login/route.ts        — POST, now a real bcrypt-checked DB lookup (existing file, modified)
apps/web/app/api/switch-fleet/route.ts — existing file, gains @gamopls/db to persist last_fleet_id
apps/web/app/api/org/route.ts          — GET (org name, members, invite link) — owner-only
apps/web/app/api/org/invite/route.ts   — POST, regenerates the invite token — owner-only
apps/web/app/signup/page.tsx           — signup form, reads ?invite= from the query string
apps/web/app/org/page.tsx              — team/invite management page
apps/web/app/login/page.tsx            — existing file, drop demo-credentials footer, add signup link
apps/web/components/fleet/VehiclesPanel.tsx — existing file, navigate to new vehicle on create
apps/web/app/fleet/vehicles/[id]/page.tsx   — existing file, + pairing/preview card
packages/auth/src/password.ts          — hashPassword/verifyPassword (bcrypt)
packages/auth/src/require-role.ts      — requireRole(claims, ...allowed) gateway-layer helper
packages/db/prisma/schema.prisma       — + Org, User models; Fleet.org_id becomes a real relation
services/fleet/src/build-app.ts        — + POST /assets/:id/preview
services/fleet/                        — + mqtt npm dependency (new, for the preview endpoint only)
```

### Why extend `@gamopls/auth` instead of adopting Auth.js/Better Auth

`suggestions.md` §8 suggests Auth.js/Better Auth. Considered and rejected for this repo specifically: both frameworks bring their own session/DB-adapter model (`Account`/`Session`/`VerificationToken` tables, their own cookie format), which doesn't map onto the org/fleet-scoped JWT the gateway and every service's `requireScope` helper already depend on. Adopting one would mean either running two parallel session systems, or rewriting `verifyJwt`/`SESSION_COOKIE_NAME` and re-testing the entire tenancy stack finished last session. Extending the existing self-issued-JWT package with password hashing is a few small additions to code that already works, not a new subsystem — and it's the only option that satisfies goal 6 for free.

### Why one org-wide invite link instead of per-invite tokens

A `OrgInvite` table (token, role, email, expiry, used_at) is the more "correct" enterprise pattern, but it requires an invite-management UI (list pending invites, resend, revoke individually) for a feature that, at this product's current team size, is used a handful of times total. A single `Org.invite_token` column — view it, copy it, regenerate it if it leaks — is one UI element instead of a whole CRUD surface, with equivalent security properties (regenerating immediately invalidates the old link for anyone who hasn't used it yet).

### Why "preview with demo data" publishes real MQTT, not a fake overlay

The whole point of this affordance (per `suggestions.md` §2: "a demo/pilot user sees live data within 60 seconds") is proving the pipeline works, for a product whose sales pitch is live visibility. A button that just writes fake numbers into `services/fleet`'s database would make the map/digital twin lie about their own data source and wouldn't touch `services/map`'s position cache at all (that's fed only by real `AssetLocationUpdated` events over NATS, populated from MQTT via `core-ingestion`). Publishing one real MQTT message — using the exact payload shape `infra/simulators/edgebox-sim` already produces, authenticated as the `edgebox` broker user set up last session (S-2) — means it flows through the identical ingestion → `ai-engine` scoring → `services/fleet`/`services/map`/`services/board` path a real Edge Box would use. It's a real (single) data point, not a demo-mode branch anywhere in the pipeline.

## Data model (Prisma additions to `packages/db/prisma/schema.prisma`)

```prisma
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

  users  User[]
  fleets Fleet[]

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
  // Last fleet_id issued into this user's JWT (via signup or /api/switch-fleet).
  // Login re-opens here instead of always defaulting to the org's first fleet.
  // Nullable only because it doesn't exist until the first login/switch sets it.
  last_fleet_id String?  @db.Uuid
  created_at    DateTime @default(now()) @db.Timestamptz()
  updated_at    DateTime @default(now()) @updatedAt @db.Timestamptz()

  @@index([org_id])
  @@map("users")
}
```

`Fleet` (existing model) changes from a free-string `org_id` to a real relation:

```prisma
model Fleet {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_id     String   @db.Uuid
  org        Org      @relation(fields: [org_id], references: [id])   // new
  name       String
  created_at DateTime @default(now()) @db.Timestamptz()
  updated_at DateTime @default(now()) @updatedAt @db.Timestamptz()

  @@index([org_id])
  @@map("fleets")
}
```

**Existing-data migration**: today's dev/demo database has `Fleet`/`Asset`/etc. rows carrying `org_id` values like `"org-demo"` or `"org-chennai-pilot"` (free strings, from `.env`'s `DEMO_LOGIN_*` vars) that don't correspond to any row anywhere. The migration seeds one `Org` (id derived from a fixed UUID, name "Demo Org") + one `User` (email/password from today's `DEMO_LOGIN_USERNAME`/`DEMO_LOGIN_PASSWORD`, bcrypt-hashed at migration time, role `owner`) matching those values, and backfills any existing `Fleet.org_id` string that equals `DEMO_LOGIN_ORG_ID` to that seeded `Org.id`, so the FK doesn't orphan pilot data that's already flowing.

## Flows

### Sign up (new org)

`GET /signup` (no query params) shows: email, password, full name, company/org name. `POST /api/signup` with `{ email, password, name, org_name }`:
1. Validate: email looks like an email and isn't already a `User.email`; password is at least 8 characters (no other complexity rule — friction here has a real cost and bcrypt makes length the only lever that matters).
2. In one Prisma transaction: create `Org(name: org_name)`, create `User(org_id, email, password_hash: bcrypt(password), name, role: owner)`, create `Fleet(org_id, name: "Main Fleet")`.
3. Issue a JWT with the existing claim shape (`user_id`, `org_id`, `fleet_id` = the new Fleet's id, `role: "owner"`), set the session cookie exactly as `/api/login` does today, and write that same `fleet_id` onto the new `User.last_fleet_id` (see "Log in" below for why).
4. Redirect to `/fleet` — the existing Fleet page, which already has a populated "Add vehicle" form and an empty-state message on the vehicles table. No new landing page needed.

### Sign up (joining via invite link)

`GET /signup?invite=<token>` looks up `Org` by `invite_token`; if found, the org-name field is replaced with a read-only "You're joining **{org.name}**" line. `POST /api/signup` with `{ email, password, name, invite_token }`:
1. Same email/password validation.
2. Look up `Org` by `invite_token`; 400 if not found (token was regenerated/never existed — the UI shows "This invite link is no longer valid, ask your team admin for a new one").
3. Create `User(org_id: that org's id, email, password_hash, name, role: fleet_manager)` — no new `Org`, no new `Fleet`.
4. Issue a JWT — `fleet_id` here needs a value; use the org's first `Fleet` (`orderBy created_at asc, take 1`) so a joining teammate lands in the same fleet the org already uses day-to-day, and write it onto `User.last_fleet_id`. They can switch fleets via the existing `FleetSwitcher` immediately after.
5. Redirect to `/fleet`.

### Log in

`POST /api/login` (existing file, rewritten): look up `User` by email; if found, `bcrypt.compare(password, user.password_hash)`. On success, issue the JWT (claim shape unchanged) using that user's `org_id`, `role`, and `fleet_id` = `user.last_fleet_id ?? <org's earliest fleet>` (same fallback query as the invite-join flow). `checkDemoCredentials`/`demo-login.ts` is deleted — the migration's seeded demo user replaces it, so `demo`/`<DEMO_LOGIN_PASSWORD>` keeps working through the real path.

Both `/api/signup` (both modes) and `/api/login` write `last_fleet_id` on the `User` row equal to whatever `fleet_id` they just put in the JWT, so it's always in sync from the first session onward. `/api/switch-fleet` (existing file) additionally persists the new choice to `user.last_fleet_id` when it re-issues the JWT — this is the one existing file in this spec that gains a new dependency, `@gamopls/db`, since today it only calls `issueJwt`/`verifyJwt` and has no database access at all.

### Managing the team (`/org`, owner-only)

Shows: org name (read-only), a table of `User` rows for the org (name, email, role, joined date), and the invite link (`{origin}/signup?invite={org.invite_token}`) with **Copy** and **Regenerate** buttons. Regenerating calls `POST /api/org/invite`, which does `org.invite_token = randomUUID()` and returns the new link — old links 404 immediately after (`Org` lookup by the stale token finds nothing). This page and its regenerate route are the **only** two things gated by `requireRole(claims, "owner")` in this whole spec.

### Preview with demo data (vehicle detail page)

On `/fleet/vehicles/[id]`, whenever `asset.telemetry_updated_at` is `null` (i.e., no reading — real or simulated — has ever arrived for this vehicle), show a small card: "Pairing ID: `{asset.id}` — use this to connect your Edge Box." plus a **"Preview with live data"** button. Clicking it calls `POST /api/fleet/assets/:id/preview` — the generic `/api/fleet/[...path]` gateway proxy already exists (`apps/web/app/api/fleet/[...path]/route.ts`), so this needs no new gateway route, just a new `POST /assets/:id/preview` handler alongside the existing `GET /assets/:id` on `services/fleet` (`services/fleet/src/build-app.ts:149`), which:
1. Loads the `Asset` to confirm it belongs to the caller's scope (reuses the existing scoped-lookup pattern) and is a vehicle with no telemetry yet.
2. Connects briefly to the MQTT broker as the `edgebox` device user (env: `MQTT_DEVICE_USERNAME`/`MQTT_DEVICE_PASSWORD`, same credentials `infra/mosquitto`'s ACL already grants write access to `edgebox/#`), publishes **one** message to `edgebox/{org_id}/{fleet_id}/preview-{asset_id}/telemetry` matching `edgebox-sim`'s exact payload shape (`device_id`, `asset_id`, `org_id`, `fleet_id`, `ts`, `gps: {lat, lng, heading, speed_kmh}`, `telemetry: {battery_pct, engine_temp_c, fuel_pct, health_score}`) with plausible Chennai-area coordinates and a healthy score (~90), then disconnects.
3. Returns 202 immediately — the UI doesn't wait for the event to land; the vehicle detail page and map already poll, so the marker/twin appear within the existing poll interval (≤5s), which satisfies the "within 60 seconds" bar with margin.

The card disappears once `asset.telemetry_updated_at` is non-null (the page already re-fetches the asset periodically for the digital twin, so no new polling logic is needed).

## Authorization

`packages/auth` gains `requireRole(claims: VerifiedGamoplsJwtClaims, ...allowed: UserRole[]): boolean` — a plain function, not middleware, mirroring how `requireScope` is called explicitly at the top of each route handler rather than injected globally. Used in exactly two route handlers: `GET /api/org` and `POST /api/org/invite`, both returning 403 with `{ error: "owner role required" }` on failure. Nowhere else in the app checks `role` after this spec, which is a deliberate, stated scope boundary — not an oversight.

## UI changes

- `/login`: remove the "Demo Credentials: demo / demo" footer text (login is real now); add a "Don't have an account? Sign up" link to `/signup`.
- `/signup` (new): the two-mode form described above (org-creation vs invite-join, switched by presence of `?invite=`).
- `/org` (new): team list + invite link management, linked from the sidebar footer (near the sign-out control) only when `session.role === "owner"`.
- `/fleet/vehicles/[id]`: new "Preview with live data" card, conditional on no telemetry yet.
- Vehicle creation (`VehiclesPanel.handleCreate`) navigates to the new vehicle's detail page on success instead of just refreshing the in-place list — that's where the pairing/preview card is waiting, so the natural next step after adding a vehicle is immediately visible instead of requiring a click to find it.

## Testing

This sub-project touches password storage and the tenant/authorization boundary — the one place in this session's work where test coverage isn't optional. TDD, matching this repo's existing conventions (Vitest, Fastify `.inject()`/route-handler-level tests):

- `packages/auth`: `hashPassword`/`verifyPassword` round-trip, `requireRole` allow/deny cases.
- Signup: creates all three rows or none on failure (transaction), rejects a duplicate email, rejects a short password, invite-mode creates only a `User` and picks the org's earliest fleet, invalid/regenerated invite token 400s.
- Login: correct password succeeds, wrong password fails, unknown email fails, claim shape matches exactly what `verifyJwt` already expects (a regression test against last session's gateway/scope-header tests should keep passing unmodified — that's the check that goal 6 held).
- `/api/org` + `/api/org/invite`: owner succeeds, `fleet_manager` gets 403, regenerating invalidates the old token.
- Preview endpoint: publishes exactly one MQTT message with the expected topic/payload shape (mock the MQTT client), refuses to run for an asset that already has telemetry, scope-checks the asset like every other `services/fleet` route.

## Deferred (explicitly out of scope, not forgotten)

- Password reset (needs an ESP — no outbound email exists anywhere in this repo yet).
- Per-invite tokens/expiry/roles-at-invite-time.
- Full `org_id`/`fleet_id` FK sweep across every table (`suggestions.md` D-3's larger scope).
- Role-gating any existing board/chat/map mutation route.
- Org/fleet rename from the UI.
