# GAMOPLS TeamCore — Full Application Review & Recommendations

**Date:** 2026-07-10 · **Scope:** business, onboarding/UX flow, navigation, dashboard design, architecture, tech stack, data handling, database design, code quality, performance, security audit.
**Method:** every finding below was checked against the actual code in this repo. Findings are tagged **[VERIFIED]** (confirmed by reading/running the code) or **[LIKELY]** (strongly indicated, needs a runtime check). File paths are given so each item is actionable.

---

## 0. Executive summary — the ten things that matter most

| # | Finding | Severity | Where |
|---|---------|----------|-------|
| 1 | Backend services are **unauthenticated network endpoints** that trust caller-supplied tenancy. Anyone who can reach ports 4300–4700 can read/write any tenant's data — and even *through* the gateway, `board`/`chat` create routes trust `org_id` from the request **body**, which the gateway does not overwrite. Cross-tenant write injection is possible today. | **Critical** | §6, S-1 |
| 2 | **MQTT ingestion is anonymous and tenancy comes from the device payload.** Anyone on the network can publish fake telemetry for any org/fleet — poisoning positions, health scores, alerts, and maintenance suggestions. Mosquitto is pinned to an EOL 1.6 image. | **Critical** | §6, S-2 |
| 3 | `services/map` scopes live positions **by URL path param only** — an authenticated user of fleet A can read fleet B's live vehicle positions by editing the URL. Geofence update/delete have **no tenancy check at all** (IDOR). | **Critical** | §6, S-3 |
| 4 | **Geofence creation from the UI is broken**: `GeofencePanel` sends `org_id: ""` believing "the gateway overwrites it" — the gateway only overwrites *query params*, and the map service requires `org_id` (min 1 char) in the *body*, so the request 400s. | **High (live bug)** | §6, S-4 |
| 5 | **A new customer cannot onboard at all.** There is no signup, no org creation, no user store (login is a hardcoded demo credential from env vars), and no "create fleet" UI (`createFleet()` exists in `api.ts` but nothing calls it). The `role` claim is carried everywhere and **enforced nowhere**. | **Critical (business)** | §2, §6 |
| 6 | The architecture is a **distributed monolith**: 9 deployable processes sharing one Prisma schema and one database. You pay microservice ops cost with none of the isolation benefit. Consolidate to a modular monolith (3 deployables) while keeping the module/plugin *boundaries* in code. | **High** | §5 |
| 7 | **`ai-engine` republishes to the same NATS subject it consumes**, using a `_processed_by_ai` marker to avoid loops. Every event is processed twice by `services/fleet`, and the marker is **persisted into `Asset.telemetry` in the database** (data pollution). | **High (bug)** | §5, A-2 |
| 8 | **No telemetry history exists anywhere.** Only the latest snapshot is stored, so fuel-efficiency is computed from two adjacent ticks (fragile), the dashboard can never show trends, and the reference design's time-range selector (1H/24H/1W/1M) has nothing to query. Add a time-series table (TimescaleDB). | **High** | §8 |
| 9 | The **Maintenance card logs service against the stale onboarding odometer** (`vehicleDetails.odometerKm`, set once at creation) instead of the live telemetry odometer. Maintenance records will be logged at wrong readings. | **High (bug)** | §8, D-1 |
| 10 | The app has **no Overview dashboard, no active-nav state, no breadcrumbs, no way to reach a vehicle's detail page except via a map popup**, and the post-login homepage is marketing copy. Adopt the reference ops-console design (§4) — the 8.0 token work makes this a cheap reskin, not a rewrite. | **High (UX)** | §3, §4 |

The good news: the stack itself (Next.js, Fastify, Prisma/Postgres, NATS, Go ingestion, Leaflet) is **suitable — do not rewrite it** (§7). The problems are topology (too many deployables), missing platform layers (auth, realtime, history), and a tenancy-enforcement pattern that three of the six services never adopted. Two services (`hub`, and `fleet` after its review fix) already implement the correct pattern — the fix is mostly "make the rest match."

---

## 1. Business & product review

**What the product is:** a fleet-ops SaaS for Indian courier/cab/logistics operators (Chennai pilot) with an Edge Box telemetry device. The money story is real and well-chosen: prevent breakdowns (service-due-by-mileage), cut fuel waste (km/L + idle alerts), and live visibility (map). All three are implemented.

**What's missing to actually sell it:**

1. **ROI must be visible in ₹, not in health scores.** Operators buy savings. Add a simple monthly report: `idle hours × avg fuel burn × diesel price = ₹ wasted`, `services done on time vs late`, `km/L trend per vehicle`. All the raw data already flows through the system; only the aggregation + a report page is missing.
2. **Alerts must reach WhatsApp/SMS.** Indian fleet operators do not sit in dashboards; they live in WhatsApp. The `AlertRaised` → chat pipeline already exists — add a notification adapter (WhatsApp Business API / MSG91 SMS) as one more `AlertRaised` consumer. This is the single highest-leverage retention feature.
3. **Driver accountability is built but not surfaced.** `DriverAssignment` history exists in the DB; nothing shows "who was driving when the idle alert fired." Join assignment history with alerts/trips into a per-driver view — it's a report, not new infrastructure.
4. **Pricing/packaging:** per-vehicle/month tiers map naturally to what's built — *Track* (map + alerts), *Optimize* (+ maintenance, mileage, idle), *Automate* (+ AI suggestions, future plugins). The plugin architecture is a genuine moat for the defence/mining/maritime expansion story, but don't build those until vehicle revenue exists (the repo's own CLAUDE.md already says this — good).
5. **Pilot-readiness blockers**, in order: security items S-1/S-2 (a pilot on a shared network is exploitable today), onboarding (§2 — you cannot demo self-serve), telemetry history (§8 — week-two questions will be "show me last week"), and hub file storage being single-node local disk.

---

## 2. Onboarding & user flow — current vs. proposed

**Current first-run experience [VERIFIED]:**

1. User lands on `/` — a marketing hero ("Human-Machine Fleet Control Cockpit") even when logged in.
2. Logs in with `demo`/`demo` (hardcoded env credentials; no signup exists — `apps/web/lib/demo-login.ts`).
3. Their JWT carries `fleet_id: "fleet-demo"` — a string that **doesn't correspond to any row** in the `fleets` table (which uses UUIDs). Assets created now are attached to a fleet id that the fleet switcher can never display.
4. There is **no UI to create a fleet** — `createFleet()` in `apps/web/components/fleet/api.ts:42` has zero callers. The `FleetSwitcher` can only list/switch, so a fresh org sees `fleet: fleet-demo` forever.
5. To add a vehicle they must discover the "Fleet" nav item; the form is good (2 required fields — this part was done right).
6. To see that vehicle's detail page, the **only** path is Map → click marker → "More details". The Vehicles table rows are not clickable.
7. Nothing explains how to connect an Edge Box to a vehicle (`asset_id` pairing is implicit in the MQTT payload; no UI shows or sets it).

**Proposed flow (all standard patterns, no new architecture):**

1. **Signup** → creates `User` + `Org` rows (see §8 for the missing tables) → auto-creates a first fleet ("Main Fleet") → issues JWT with real UUIDs.
2. **First-run wizard (3 steps, skippable):** ① name your fleet → ② add your first vehicle (existing form) → ③ "Connect your Edge Box" — show the pairing id/QR for the vehicle and a **"use simulator" toggle** so a demo/pilot user sees live data within 60 seconds (the simulator already exists in `infra/simulators`).
3. **Land on the Overview dashboard** (§4), not marketing copy. Empty states everywhere must carry the next action ("No vehicles yet → Add vehicle").
4. **Add Fleet** entry in the fleet switcher dropdown (wire the dead `createFleet`).
5. Make **every vehicle row a link** to `/fleet/vehicles/[id]`, and give that page a breadcrumb + back affordance.

---

## 3. Navigation & information architecture

**Current problems [VERIFIED]:**
- No active state on sidebar links (no `usePathname` anywhere — you can't tell where you are).
- Flat 5-item nav (Fleet/Map/Chat/Board/Hub) mixes daily-driver pages with rarely-used ones, and the names are internal jargon ("Board", "Hub" mean nothing to a fleet operator).
- No breadcrumbs; vehicle detail page is a dead end; maintenance lives only inside vehicle detail.
- Fleet switcher is a tiny unlabeled pill in the header; org context is invisible.
- No global search of any kind.
- Alerts have no home in the nav at all — they only appear as chat messages.

**Proposed IA (directly adapted from the reference design's sidebar):**

```
[Org / Fleet switcher — top of sidebar, like the reference's project selector]

OPERATIONS
  ⌂ Overview            ← new dashboard (§4), becomes "/" post-login
  ◈ Live Map
  ⚠ Alerts          (3) ← count badge, red dot like the reference's "Issues •"

FLEET
  ▣ Vehicles
  ◉ Drivers
  ⚙ Maintenance     (2) ← due-count badge; today this is buried in vehicle detail

WORKSPACE
  ☰ Tasks               ← rename "Board"; add an "AI Suggestions" inbox tab
  ✉ Chat
  ▤ Documents           ← rename "Hub"

[Fleet health meter — bottom of sidebar, like the reference's compute-usage bar:
 "Fleet health ▮▮▮▮▮▮▯▯ 87% · 2 vehicles need attention"]
[◐ Dark mode toggle · Help · Settings]
```

Plus:
- **Active nav state**: extract `NAV_LINKS` rendering into a small `"use client"` `<SidebarNav>` using `usePathname` (the layout is a Server Component, same pattern as the existing `ThemeToggle` split).
- **Breadcrumbs** on all detail pages: `FLEET / VEHICLES / TN-09-AB-1234` (mono microcaps, exactly like the reference's `SPARKPIXEL / ISSUES`).
- **⌘K command palette** (`cmdk` package, ~1 day): search vehicles by plate, drivers by name, documents; actions "Add vehicle", "Log maintenance", "Switch fleet". The reference makes this a first-class element; for a keyboard-using dispatcher it collapses most navigation.
- **Toasts** for mutation success/failure (today saves are silent) and **confirm dialogs** for destructive actions (geofence delete currently deletes instantly with no confirmation).
- The **driver-assign control** (a bare `<select>` that fires on change with no confirmation and resets itself) should become a row action → dialog with an explicit Assign button and an undo toast.

---

## 4. Dashboard & UI design direction (from the reference screenshots)

The reference (SYNAPSE-style infrastructure console) is a strong fit for this product — it is exactly the "ops console for non-tech operators" register: dense but legible, status-first, monospace data. **Recommendation: adopt it as the design language, and adopt its layout wholesale for a new Overview page.** Because Phase 8.0 moved every color to CSS tokens, this is a token + component pass, not a rewrite.

### 4.1 Design tokens (extends `apps/web/app/globals.css`)

| Token | Dark (primary theme) | Light |
|---|---|---|
| `--background` | `#0B0C0E` (near-black, keep flat — no navy) | `#F6F7F8` |
| `--card` | `#121316` | `#FFFFFF` |
| `--card-raised` (new) | `#17181C` | `#FAFAFB` |
| `--border` | `#26282E` 1px everywhere | `#E4E6EA` |
| Radius | **6px cards / 4px chips & inputs** on data surfaces (sharper than current 10px — this is most of the reference's "instrument" feel) | same |
| Brand accent | keep current `--primary`; the reference's orange (`#F97316`-ish) is an option if you want a stronger identity — one-line token change either way | indigo (current) |

### 4.2 Typography — one deliberate revision to the 8.0 decision

8.0 chose "Geist Sans everywhere, no mono." The reference's character comes largely from **monospace microlabels and numerals**. Recommendation: add **Geist Mono** (same family, zero-friction) used *only* for: uppercase 11px section/column labels (`ACTIVE VEHICLES`, `CPU & TREND`-style headers), numeric cells (odometer, %, km/L — tabular alignment), timestamps, and status chips. Prose, buttons, and forms stay Geist Sans. This is a `--font-mono` variable plus a `.text-data` utility — small change, most of the visual payoff.

### 4.3 Component vocabulary (each maps 1:1 to something in the reference)

- **Status chip**: bordered, tinted, uppercase mono — the single most reused element. Fleet vocabulary: `MOVING` (green) · `IDLE` (amber) · `STOPPED` (gray) · `OFFLINE` (red-gray) · `EN ROUTE` (blue, like the reference's `DEPLOYING`) · `SERVICE DUE` (orange) · `CRITICAL` (red). Build once in `packages/ui`, replace ad-hoc badges.
- **KPI stat tile**: icon chip + mono microlabel + large mono value + **delta chip vs. previous window** (`+5%` green / `−12%` red). Overview row: *Vehicles online 12/14* · *Active alerts 3* · *Avg fleet health 87%* · *Distance today 412 km*. (Deltas require §8's telemetry history.)
- **Real-time events feed** (right rail of Overview): the reference's killer feature. Stream `AlertRaised` + `TaskSuggested` rows — severity chip, mono timestamp, one-line message, **expandable raw telemetry `<pre>` block** exactly like the reference's JSON payload. Data source already exists on the bus; today these events are only visible as chat messages.
- **Bar-cell sparklines** in tables: the reference's 5-segment CPU bars → fuel level and health trend cells in the Vehicles table.
- **Time-range segmented control** (`1H / 24H / 1W / 1M`) on Overview + vehicle detail — gated on telemetry history (§8).
- **Table refinement**: mono numerals right-aligned, sortable headers (`⇅`), per-row `⋯` action menu (assign driver, log maintenance, view) — replaces today's mixed table styles.

### 4.4 Page-level changes

1. **New `/` (authed) = Overview**: KPI row · Vehicles status table (chips + bar cells) · Events feed right rail · time-range control. Move the marketing hero to a public landing page only.
2. **Vehicle detail** becomes the reference's "instance detail" pattern: breadcrumb, chip row (status/health/service-due), digital twin + KPI tiles, tabs for Telemetry (chart, needs §8) / Maintenance / Driver history (data exists, unsurfaced) / Geofences.
3. **Consolidate the two component systems**: `packages/ui` (inline-style Button/Card/Spinner/DataTable) vs `apps/web/components/ui` (shadcn) — two Buttons and two Cards exist today. Converge on Tailwind/shadcn-style in `packages/ui`, delete the inline-style versions (inline styles also can't respond to theme tokens properly; `Button` still hardcodes style props at every call site).

---

## 5. Architecture review

### What is genuinely good (keep)
- The **contract-first plugin model** (`asset-contracts` role interfaces, event schemas with zod validation at boundaries, no service importing a concrete plugin — enforced by `scripts/check-architecture-rules.mjs`). This is the company's expansion story; preserve it.
- **Event-driven propagation** (ingestion → NATS → consumers) with drop-and-log on malformed payloads, everywhere.
- **BFF gateway** with JWT verification and query-param tenancy injection — right idea, incompletely adopted (§6).
- Repository ports with in-memory + Prisma implementations → fast tests.
- `hub` and (post-fix) `fleet` are the reference implementations of correct tenancy; the pattern exists in-repo.

### What is wrong

**A-1 · Distributed monolith [VERIFIED] — the big one.** Nine deployables (`web`, `map`, `chat`, `board`, `hub`, `fleet`, `registry`, `asset-vehicle`, `core-ingestion`, plus `ai-engine` = ten) all share **one Prisma schema and one Neon database** (`packages/db`). That combination has the operational cost of microservices (10 processes, 10 ports, cross-service HTTP, sagas with compensating deletes for what could be one transaction) and none of the benefit (no independent data ownership, no independent scaling need at pilot size — these Fastify services are each a few hundred lines).

**Recommendation: consolidate to a modular monolith — 3 deployables — without losing the architecture.**
```
1. apps/web            (unchanged)
2. services/core-api   (one Fastify process mounting map/chat/board/hub/fleet/
                        registry/asset-vehicle as modules under route prefixes;
                        each keeps its own directory, repository, tests, and the
                        EventPublisher/Subscriber ports — now with an in-process
                        bus locally and NATS in prod, same interface)
3. services/core-ingestion (Go — keep separate; different language, different
                        failure domain, the one component with real fan-in load)
(+ optional 4th: ai-engine, see §7)
```
The CLAUDE.md rules still hold as *module* rules: modules don't import `plugins/asset-vehicle` internals, they call its module interface; the CI guard keeps enforcing it. When a real second asset class or a scaling wall arrives, a module extracts back into a service cleanly because the ports never changed. The vehicle-onboarding saga (create Asset → HTTP call → compensating delete) becomes a single transaction. This can be done incrementally — fold `registry` + `asset-vehicle` + `hub` first.

**A-2 · ai-engine feedback loop & data pollution [VERIFIED — bug].** `ai-engine` consumes `AssetHealthChanged`, mutates `telemetry._processed_by_ai = true`, and republishes to the **same subject**. Consequences: (1) `services/fleet` processes every reading twice (double service-due checks, double mileage attempts); (2) the `_processed_by_ai` marker is persisted verbatim into `Asset.telemetry` in Postgres; (3) event ordering between raw and rescored writes is racy. **Fix:** split subjects — ingestion publishes `telemetry.raw`, ai-engine consumes raw and publishes `AssetHealthChanged` (scored), fleet/map consume only the scored subject. Removes the marker hack entirely. (~half-day.)

**A-3 · At-most-once event bus [VERIFIED].** Code uses core NATS pub/sub: any consumer restart loses events — a missed `AssetHealthChanged` can permanently miss a service-due threshold crossing; a missed `AlertRaised` never reaches chat. The compose file already runs NATS **with JetStream enabled (`-js`)** — adopt it: durable consumers + explicit acks for `fleet`, `board`, `chat`, `ai-engine`. (~1–2 days.)

**A-4 · `services/registry` is write-only [VERIFIED].** Plugins register; nothing ever reads the registry. Fold it into core-api as a table + two routes, or park it until a second asset plugin exists.

**A-5 · WebSocket broadcaster built, never used [VERIFIED].** `services/map` serves `/ws/fleets/:fleetId/positions`; the web app polls REST every 5s. Either is fine — having both is dead weight. Recommendation: **SSE from a Next route handler** (subscribes to NATS positions, streams to browser) — SSE traverses the auth gateway naturally (WS can't be proxied by Next route handlers), works with the existing cookie auth, and kills the 5s staleness + full-payload polling. Then delete the WS endpoint.

**A-6 · Hand-mirrored event schemas ×3 languages [VERIFIED risk].** zod (TS) + Pydantic (Python) + Go structs, kept in sync by comments. One drifted-comment incident already occurred (caught in the 8.D review). **Fix:** generate JSON Schema from the zod definitions (`zod-to-json-schema`) into `packages/event-schemas/json/`, and add CI checks in Go/Python that validate their models against it.

**A-7 · Dead third repository [VERIFIED].** `services/board/src/postgres-repository.ts` (raw `pg`) is exported but never wired — `server.ts` uses Prisma or in-memory. Delete it (and drop the `pg` dependency).

---

## 6. Security audit

> **Overall posture:** the *gateway-inward* design is right, but three of six services never adopted it, internal services are open network listeners, and the device-ingestion edge is fully trusting. For a pilot on customer premises or shared cloud, S-1/S-2/S-3 must be fixed first. There is also **no real identity system** — that is both a security and a business blocker.

| ID | Severity | Finding | Evidence | Fix |
|----|----------|---------|----------|-----|
| **S-1** | **Critical** | **Internal services are unauthenticated and trust caller tenancy.** All services bind `0.0.0.0` with no auth; tenancy arrives as plain query params/body that any network peer can set. Even through the legit gateway: `board POST /missions|/tasks` and `chat POST /channels` validate `org_id`/`fleet_id` **from the request body**, which the gateway does *not* overwrite → an authenticated org-A user can create missions/channels inside org B. | [VERIFIED] `services/board/src/build-app.ts:46-53` uses `parsed.data` (body); `services/chat/src/schemas.ts:5-10` requires body `org_id`; gateway only sets query params (`apps/web/lib/gateway-proxy.ts:53-70`); `HOST ?? "0.0.0.0"` in every `server.ts`. | Two moves: **(1)** gateway injects a signed internal header (`x-gamopls-scope` = HMAC(org,fleet,exp) with a shared internal secret); services read tenancy **only** from that header and reject requests without it — kills both the direct-network and spoofed-body classes at once. **(2)** Port `board`/`chat`/`map` create routes to the query/header-derived pattern `fleet`/`hub` already use; delete `org_id`/`fleet_id` from all body schemas. Bind services to localhost/private network in deployment. |
| **S-2** | **Critical** | **Telemetry ingestion is anonymous + payload-trusted.** Mosquitto 1.6 (EOL; default allows anonymous) with zero config; Go client connects with no credentials; `org_id`/`fleet_id`/`asset_id` are read from the device payload. Anyone reaching :1883 can spoof any vehicle in any org — fake positions, poisoned health/fuel (which drives maintenance suggestions and mileage), alert floods. | [VERIFIED] `infra/docker-compose.yml` (no mosquitto config); `services/core-ingestion/cmd/core-ingestion/main.go` (`mqtt.Options` has no creds); `plugins/ingestion-edgebox/src/edgebox-payload.ts` (tenancy in payload). | Upgrade to mosquitto 2.x with `allow_anonymous false`; per-device username/password (or client-cert) provisioned at Edge Box pairing; **derive tenancy from the authenticated device identity server-side** (device registry: device_id → asset/org/fleet), treating payload tenancy as untrusted; enforce topic ACLs (`edgebox/<org>/<fleet>/<device>/…` writable only by that device). |
| **S-3** | **Critical** | **Cross-tenant reads + IDOR in `services/map`.** `GET /fleets/:fleetId/positions` (and the WS variant) uses the **path param** only — gateway-injected query scope is ignored, so any authenticated user can read any fleet's live positions by editing the URL. `PUT/DELETE/GET /geofences/:id` have **no tenancy check** — cross-tenant geofence read/update/delete by id. | [VERIFIED] `services/map/src/build-app.ts:117-121` and geofence `:id` routes. | Positions: require `query.fleet_id === params.fleetId` (or drop the path param and use injected scope). Geofence `:id` routes: load, then compare stored `org_id`/`fleet_id` to injected scope; 404 on mismatch. Same header mechanism as S-1 makes this uniform. |
| **S-4** | **High (live bug)** | **Geofence creation from the UI 400s.** `GeofencePanel` sends `org_id: ""` with a comment claiming the gateway overwrites it (it doesn't — bodies pass through untouched); the schema requires `min(1)`. Also a misleading security comment worth deleting. | [VERIFIED] `apps/web/components/map/GeofencePanel.tsx:63`, `apps/web/components/map/types.ts:55-60`, `services/map/src/geofence/types.ts:14-15`. | Falls out of S-1's fix (scope from header/query, removed from body). Delete the false comments in `types.ts`/`api.ts`. Add an E2E test that actually creates a geofence through the gateway. |
| **S-5** | **Critical (product)** | **No identity system.** Single hardcoded demo credential from env; no `User`/`Org` tables; no signup/reset/invite; JWT `role` claim is **never checked anywhere** — a future "driver" login would have identical power to a fleet manager. | [VERIFIED] `lib/demo-login.ts`; grep shows `role` only displayed/re-issued, never compared. | Adopt Auth.js (or Better Auth) with credentials + the §8 `users`/`orgs` tables; keep the existing claim shape so the gateway is untouched. Add a tiny authz helper (`requireRole("fleet_manager")`) at the gateway/route level for mutating routes. Bcrypt/argon2 hashes, email verification for invites. |
| **S-6** | **High** | **Login endpoint has no rate limiting or lockout**; JWT is HS256 with a `changeme` default secret in `.env.example`, 1h expiry, **no refresh** (sessions silently die hourly — also a UX bug: fetches start 401ing with no redirect-to-login handling in the API clients). | [VERIFIED] `app/api/login/route.ts`; `packages/auth/src/jwt.ts`. | `@upstash/ratelimit` (Redis already in stack) on `/api/login`; startup assertion refusing the default secret outside dev; sliding-window refresh (re-issue when <15 min left, in the gateway); API clients redirect to `/login` on 401. |
| **S-7** | **Medium** | **No security headers.** `next.config.mjs` sets none — no CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. | [VERIFIED] `apps/web/next.config.mjs`. | Add a `headers()` block; CSP is easy here (no third-party scripts; allow OSM tile images for Leaflet). |
| **S-8** | **Medium** | **Document upload pipeline: base64-in-JSON + default 1MB Fastify body limit vs a UI that only warns at 5MB.** Real uploads over ~750KB binary (>1MB as base64+JSON) get 413 — the UI's warning threshold is 6× above what the server accepts. No server-side MIME/extension allowlist or size policy; storage is single-node local disk. Path traversal is *not* possible (id is server-side `randomUUID()` — verified). | [VERIFIED] no `bodyLimit` configured anywhere; `LARGE_FILE_WARNING_BYTES = 5MB`; `services/hub/src/build-app.ts:58` (uuid), `storage.ts` (local disk). | Switch to `multipart/form-data` (`@fastify/multipart`) with an explicit size limit + MIME allowlist; align the UI limit; move blobs to S3-compatible storage before pilot (the `StorageProvider` port makes this a drop-in). |
| **S-9** | **Medium** | **CSRF posture is acceptable but accidental.** Cookie is `httpOnly` + `SameSite=Lax` (good — blocks cross-site POSTs), but there's no explicit CSRF strategy documented; a future `SameSite=None` or subdomain change would silently open it. | [VERIFIED] `packages/auth/src/session-cookie.ts`. | Keep Lax; add an `Origin`-check in the gateway for mutating methods (2 lines); document the invariant. |
| **S-10** | **Low** | NATS monitoring port 8222 exposed by compose; no TLS on internal hops; no audit logging of who-did-what (missions/tasks/assignments have no `created_by`); no dependency scanning in CI. | [VERIFIED] compose file; schema (§8). | Private networking in deploy; add `created_by` columns (§8); `pnpm audit`/Dependabot + `govulncheck`/`pip-audit` in CI. |
| **S-11** | **Low** | `_processed_by_ai` marker persisted into the DB (integrity, covered as A-2). | [VERIFIED] | Fixed by A-2's subject split. |

**Priority order:** S-1 → S-2 → S-3/S-4 (one combined PR: "tenancy from signed header everywhere") → S-5 (auth system, biggest single work item) → S-6/S-7/S-8.

---

## 7. Tech-stack suitability — keep / change verdicts

**Overall verdict: the stack is right; don't migrate frameworks.** The pain points are topology and missing layers, not technology choices.

| Layer | Current | Verdict | Notes |
|---|---|---|---|
| Web | Next.js 15 App Router | **Keep** | BFF/route-handler gateway is a good fit. Add `headers()` (S-7); consider `output: "standalone"` for deploys. |
| HTTP services | Fastify 5 + zod | **Keep** (drop the old NestJS plan) | Fastify is lighter and already the de-facto standard here; NestJS would add ceremony for nothing. Consolidate per A-1. |
| ORM/DB | Prisma 6 + Postgres (Neon) | **Keep** + additions | Add TimescaleDB (or Neon + a partitioned table) for telemetry history (§8). Fix the `packages/db` generator `output` path — the custom `../node_modules/.prisma/client` output breaks `tsup --dts` under pnpm and cost every parallel worktree in this project a workaround [VERIFIED, recurring]; use the default output. |
| Event bus | NATS core | **Keep → JetStream** | Server already runs `-js`; adopt durable consumers (A-3). |
| Live positions cache | Redis/Upstash | **Keep** | Right tool. |
| Ingestion | Go + MQTT | **Keep** | Correct choice for device fan-in; fix auth (S-2). Mosquitto 1.6 → 2.x. |
| AI engine | Python (Pydantic; LangGraph stubbed) | **Conditional** | Today it's ~300 lines of threshold rules — as a separate deployable it's overhead. If real ML/LangGraph work starts within ~2 quarters, keep it (it's the one service with a genuine language reason). Otherwise fold the rules into core-api and reintroduce Python when the ML is real. |
| Maps | Leaflet + OSM | **Keep** | Free, adequate. Revisit (MapLibre + vector tiles) only if you need heavy styling/clustering later. |
| Frontend data | hand-rolled `fetch` + `useState` + refetch-all + 5s polling | **Change** | Add **TanStack Query** (caching, invalidation, optimistic updates — deletes most of the `load()` boilerplate in every panel) and **SSE** for positions/alerts (A-5). This is the single biggest perceived-performance upgrade available. |
| Auth | hand-rolled demo JWT | **Change** | Auth.js/Better Auth + own `users`/`orgs` tables (S-5). Keep the claim shape → gateway untouched. |
| Monorepo | pnpm + Turborepo | **Keep** | Fix `turbo.json` test `outputs: []` (current warnings) and the `pnpm --filter web test -- <pattern>` arg-passthrough trap (documented in this repo's history; standardize on direct `vitest run <pattern>` scripts). |
| Testing | vitest + RTL; no E2E | **Keep + add Playwright** | PLAN 7.1's end-to-end happy path is still unchecked; add one Playwright flow (login → add vehicle → simulator tick → marker → detail) plus **tenancy tests** that would have caught S-1/S-3. Centralize the per-file jsdom/jest-dom/cleanup boilerplate (repeated in ~10 test files) into `vitest.setup.ts`. |

---

## 8. Data handling & database design

**D-1 · Odometer lives in two places and they disagree [VERIFIED — bug].** `vehicle_details.odometer_km` is written once at onboarding; live odometer arrives in `assets.telemetry.odometer_km`. The vehicle page displays the stale one, and — worse — **`MaintenanceCard` defaults "log maintenance" to the stale value** (`apps/web/app/fleet/vehicles/[id]/page.tsx:90` passes `vehicleDetails.odometerKm`), so service records get wrong readings, which then skew every future service-due calculation. **Fix:** treat telemetry as the single live source; either sync `vehicle_details.odometer_km` from the health subscription or (simpler) read live odometer everywhere and keep the details column as "odometer at onboarding".

**D-2 · No telemetry history.** Only the latest snapshot exists (`assets.telemetry`). Consequences: km/L from adjacent ticks (noisy; a missed tick spanning a refuel silently skews it), no trend charts, no time-range UI, idle detection state is RAM-only. **Fix:** append-only `telemetry_readings(asset_id, ts, lat, lng, speed, fuel_pct, battery_pct, engine_temp_c, odometer_km)` written by one consumer; TimescaleDB hypertable + retention policy (e.g., raw 90 days, hourly rollups kept). Recompute mileage over a windowed regression instead of tick pairs. This unlocks §1's ROI reports and §4's time-range selector.

**D-3 · Identity/FK integrity gaps [VERIFIED].**
- No `orgs` or `users` tables; `org_id` is a free string from the JWT.
- `fleets.id` is a UUID but the demo JWT carries `fleet_id: "fleet-demo"` — two id vocabularies for the same concept; assets created under the demo claim are orphaned from the fleets table.
- No FKs: `assets.fleet_id → fleets.id`, `fleets.org_id → orgs.id`, `maintenance_suggestions.asset_id → assets.id` are all unenforced. (`vehicle_details.asset_id` staying FK-less is *deliberate* plugin isolation — keep that one; in a modular monolith you can add it.)
- **Fix migration:** add `orgs`, `users`; make `fleet_id`/`org_id` real FKs on fleet-owned tables; JWT carries UUIDs only.

**D-4 · Missing constraints.**
- *One open assignment per vehicle* is enforced only in application code. Add a partial unique index: `CREATE UNIQUE INDEX one_open_assignment ON driver_assignments(asset_id) WHERE unassigned_at IS NULL;` (raw SQL migration; Prisma can't express it declaratively).
- Status/severity/enum-ish columns are free strings (`Mission.status`, `Task.status`, `Driver.status`, `vehicle_type`, `fuel_type`, `service_type`) → Prisma `enum`s (or CHECK constraints) so bad writers fail at the DB.
- No `created_by`/`updated_by` anywhere → add to missions, tasks, assignments, maintenance_records (needed for audit, S-10, and the driver-accountability feature).

**D-5 · No pagination on any list endpoint [VERIFIED]** (missions, tasks, channels, messages, documents, assets, drivers all return full tables). Fine at 10 vehicles; falls over during the pilot at message/telemetry volume. Add cursor pagination (`?limit&cursor`) to messages and tasks first, then the rest; pairs naturally with the TanStack Query adoption.

**D-6 · Wire-format inconsistency [VERIFIED].** `Asset` serializes snake_case (`display_label`, `health_score`) while `VehicleDetails`/`MaintenanceRecord` serialize camelCase (`plateNumber`, `odometerAtServiceKm`) — visible in the mixed frontend types. Pick one convention (camelCase on the wire, snake_case in DB, mapped at the repository like the plugin already does) during the A-1 consolidation.

**D-7 · Local-dev infra drift [VERIFIED].** `infra/docker-compose.yml` contains only NATS + MQTT, while CLAUDE.md/PLAN claim Postgres/TimescaleDB/Redis are in it, and `.env.example` points at a `localhost:5432` nothing provisions (this project ran on a hand-started container). Add `timescale/timescaledb` + `redis` services to compose and correct CLAUDE.md.

---

## 9. Code simplification inventory

Duplication and dead weight, each with its consolidation target:

| # | Duplication / dead code [all VERIFIED] | Instances | Fix |
|---|---|---|---|
| C-1 | `healthTone()` + `TONE_COLORS` | 4 copies (`MapCanvas`, `VehiclesTable`, `VehicleDigitalTwin`, was in vehicle page) | One `packages/ui/health.ts` (`toneFor` in `VehicleDigitalTwin` is the best-shaped — parameterized thresholds; promote it) |
| C-2 | `parseOrThrow` + per-module `ApiError` classes | 4 copies (`map/api.ts`, `board/api.ts`, `hub/api.ts`, `fleet/api.ts`) | One `apps/web/lib/api-client.ts` factory (`createApi("fleet")`) — also the single place to add 401→login redirect (S-6) |
| C-3 | Registry registration client | 2 copies (`plugins/asset-vehicle/registration-client.ts`, `services/board/agent-registration-client.ts`) | `packages/registry-client` (both are services; the "don't share with plugins" rule was about asset logic, not an HTTP client) — or deleted entirely by A-4 |
| C-4 | `services/board/src/postgres-repository.ts` | dead (never wired) | Delete + drop `pg` dep |
| C-5 | Fastify service scaffolding (`buildApp` boilerplate, `tenancyQuery`, health route, in-memory repo patterns) | 7 near-identical services | Collapses automatically under A-1 consolidation; otherwise a tiny `packages/service-kit` |
| C-6 | Two UI component systems (`packages/ui` inline-style vs `components/ui` shadcn) | 2 Buttons, 2 Cards | Converge on shadcn-style in `packages/ui` (§4.4) |
| C-7 | Per-test-file boilerplate (`@vitest-environment jsdom`, jest-dom import, `afterEach(cleanup)`) | ~10 test files | `vitest.setup.ts` + `environmentMatchGlobs` in one config |
| C-8 | Form scaffolding (error banner, submitting state, trim-and-null) | 6 form components | Small `useFormSubmit` hook + `<FormError>`; keep plain `useState` (no form library needed at this size) |
| C-9 | Event schemas hand-mirrored in Go/Python | 3 languages | JSON Schema codegen + CI validation (A-6) |
| C-10 | `switch-fleet` re-implements gateway auth inline | 1 | Reuse a shared `requireSession()` helper with the gateway |

Also: the misleading "gateway overwrites body org_id" comments in `apps/web/components/map/types.ts` and `api.ts` must be deleted with S-4 — wrong security documentation is worse than none.

---

## 10. Performance & efficiency

1. **Polling → push.** 5s full-payload position polling per client → SSE stream (A-5). Also fixes the 5-second staleness on the map.
2. **Refetch-all → TanStack Query.** Every mutation currently re-fetches entire lists (`load()` after each create/assign); DriversPanel fetches vehicles *and* drivers on every change. Query invalidation + optimistic updates make the UI feel instant and cut request volume ~70% on those pages.
3. **Leaflet churn:** `markerIcon()` builds a new `L.DivIcon` per marker per render, and `MapView` rebuilds the `assetsById` map + `markers` array every render (flagged in the 8.B review). Memoize both (`useMemo`, icon cache keyed by tone).
4. **Uploads:** base64-in-JSON adds 33% payload overhead on top of the S-8 breakage — multipart streaming fixes both.
5. **DB:** add `(org_id, fleet_id, created_at)` composite indexes on list-ordered tables when pagination lands; the existing per-table indexes are otherwise sensible.
6. **Build hygiene:** turbo `outputs` warnings on every test task; `@gamopls/db` dts flakiness (§7) — both are dev-loop taxes worth the hour each.
7. Bundle is healthy (103 kB shared JS) — no action needed.

---

## 11. Roadmap

**NOW — pilot blockers (≈1–2 weeks, mostly small PRs)**
1. Tenancy hardening in one PR: signed internal scope header at the gateway; `board`/`chat`/`map` read scope only from it; fix map path-param/IDOR routes; remove `org_id`/`fleet_id` from all body schemas (S-1/S-3/S-4 + fixes the broken geofence UI). **[M]**
2. MQTT auth + mosquitto 2.x + device-identity→tenancy mapping (S-2). **[M]**
3. Split `telemetry.raw` / scored subjects; stop marker persistence (A-2). **[S]**
4. Maintenance card uses live odometer (D-1). **[S]**
5. Login rate limit, secret assertion, security headers, Origin check (S-6/S-7/S-9). **[S]**
6. Dead-code sweep: postgres repo, WS broadcaster (after SSE decision), false comments (C-4, A-5, §9). **[S]**
7. Compose: add TimescaleDB + Redis; fix CLAUDE.md drift (D-7). **[S]**

**NEXT — pilot hardening & product completeness (≈3–6 weeks)**
8. Real auth: `orgs`/`users` tables, signup, invites, role checks; create-fleet UI; first-run wizard with simulator toggle (S-5, §2, D-3). **[L — biggest item]**
9. Overview dashboard + nav IA + design language v2 (mono/chips/KPIs/events feed) (§3–4). **[M/L]**
10. TanStack Query + SSE positions/alerts (§10). **[M]**
11. `telemetry_readings` time-series + windowed mileage + time-range UI (D-2). **[M]**
12. JetStream durable consumers (A-3). **[M]**
13. Pagination on messages/tasks/assets (D-5); multipart uploads (S-8). **[M]**
14. Playwright E2E: happy path + cross-tenant denial tests in CI. **[M]**
15. Begin modular-monolith consolidation: fold `registry` + `asset-vehicle` + `hub` into core-api (A-1, incremental). **[L]**

**LATER — growth**
16. WhatsApp/SMS alert delivery; ROI report page + CSV/PDF export (§1). 
17. Driver accountability view (assignment × alerts × trips). 
18. Mobile driver app (per original plan), PWA + offline tolerance for cab-mounted tablets, Tamil/Hindi i18n. 
19. S3 document storage; audit log UI; RBAC beyond two roles. 
20. Complete consolidation; extract a module to a real service only when scale demands it; second asset-type plugin when the business is ready.

---

## Appendix — quick-wins checklist (each < half a day)

- [ ] Delete `services/board/src/postgres-repository.ts` + `pg` dep
- [ ] Fix `MaintenanceCard` stale-odometer default
- [ ] Split ai-engine publish subject; drop `_processed_by_ai`
- [ ] Remove `org_id`/`fleet_id` from `chat`/`board`/`map` body schemas (with S-1 PR)
- [ ] Delete false "gateway overwrites body" comments in map web types/api
- [ ] `usePathname` active state in a client `<SidebarNav>`
- [ ] Make `VehiclesTable` rows link to `/fleet/vehicles/[id]`
- [ ] Wire `createFleet()` into a "+ New fleet" item in `FleetSwitcher`
- [ ] Add `headers()` security block to `next.config.mjs`
- [ ] Rate-limit `/api/login`; refuse default `JWT_SECRET` outside dev
- [ ] Consolidate `healthTone` into `packages/ui`
- [ ] `vitest.setup.ts` for jsdom/jest-dom/cleanup boilerplate
- [ ] `turbo.json`: `outputs: []` on test tasks
- [ ] Partial unique index: one open `driver_assignment` per asset
- [ ] Add TimescaleDB + Redis to `infra/docker-compose.yml`; update CLAUDE.md
- [ ] Prisma generator `output` → default path (fixes recurring dts build breakage)
