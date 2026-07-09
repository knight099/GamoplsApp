# GAMOPLS TeamCore — V1 Implementation Plan

Scope: `apps/web`, `services/core-ingestion`, `services/map`, `services/board`, `services/chat`, `services/hub`, `plugins/asset-vehicle`, `plugins/ingestion-edgebox`, plus the shared `packages/*` and `infra/` they depend on. `apps/mobile` and non-vehicle plugins are explicitly out of scope until the web MVP is live for the Chennai pilots (see [CLAUDE.md](CLAUDE.md)).

This plan exists to keep the build order from accidentally violating the architecture rules in CLAUDE.md — the biggest risk on this repo isn't "wrong feature," it's "module service quietly grows a dependency on a concrete plugin" or "two services start talking to each other directly instead of through events." Sequencing below is designed so those shortcuts are never the path of least resistance.

## How SOLID maps onto this architecture

Each principle corresponds to a concrete rule already stated in CLAUDE.md — this is the lens every sub-problem below is checked against:

| Principle | Concrete rule in this repo |
|---|---|
| **S**ingle Responsibility | Each service owns exactly one domain concern (map = geospatial, chat = messaging, board = tasks, hub = documents). A service that starts doing two of these is a signal to split it. |
| **O**pen/Closed | Module services are closed for modification but open for extension: new asset behavior is added by shipping a new plugin, never by editing `services/map` etc. |
| **L**iskov Substitution | Any `Asset` implementation (vehicle today, drone/vessel later) must be usable anywhere the `Asset` interface is expected, with no type-checks or behavior surprises in the consuming service. |
| **I**nterface Segregation | `Asset` is split into narrow role interfaces (`Locatable`, `Monitorable`, `Alertable`, `Communicable`, `Taskable`) so a plugin only implements the capabilities it actually has. |
| **D**ependency Inversion | Module services depend on `packages/asset-contracts` and `packages/event-schemas` (abstractions), never on `plugins/*` (concretions). Wiring happens through the plugin registry and the event bus, not imports. |

## Open decisions (need your call before Phase 5+)

These aren't blockers for Phase 0–4, but I made a default assumption for each — flag if you want something different:
1. **Plugin registry location** — CLAUDE.md describes a plugin registry ("CORE") but the folder layout doesn't list a `services/core` module. Default: implement it as a small standalone NestJS service (`services/registry`) rather than bolting it onto `board`. Alternative: fold it into the API gateway.
2. **API gateway** — multi-tenancy scoping must happen "at the API gateway," but no gateway service is listed. Default: a thin NestJS gateway (or Next.js middleware + BFF route handlers in `apps/web`) that validates JWT/ABAC claims and forwards to `map`/`chat`/`board`/`hub`. Alternative: use a dedicated API gateway product (Kong/Envoy) — bigger infra lift, probably premature for V1.
3. **Auth provider** — not specified. Default: self-issued JWT (org_id/fleet_id/role claims) via a `packages/auth` package shared by gateway and services, swappable later for Auth0/Clerk.
4. **Event bus transport** — CLAUDE.md says "NATS/Kafka." Default: NATS (already in `infra/docker-compose.yml` plan, lighter ops than Kafka for a pilot).

---

## Phase 0 — Repo & tooling scaffolding

Goal: an empty-but-runnable monorepo skeleton. No business logic yet.

- [ ] 0.1 Root `package.json` + `pnpm-workspace.yaml` declaring `apps/*`, `services/*` (Node only), `packages/*`, `plugins/*`
- [ ] 0.2 `turbo.json` with `build`/`lint`/`test`/`dev` pipelines
- [ ] 0.3 `packages/config` — shared `tsconfig.base.json`, `eslint` config, `prettier` config (SRP: one package, one job — config, nothing else)
- [ ] 0.4 Root `.gitignore`, `.nvmrc`/`.node-version`, `.env.example`
- [ ] 0.5 `infra/docker-compose.yml` — Postgres+TimescaleDB, Redis, NATS, with named volumes and healthchecks
- [ ] 0.6 CI skeleton (GitHub Actions): install → lint → build → test on PR

**Acceptance:** `pnpm install && pnpm build` succeeds with zero packages (empty workspaces don't error); `docker-compose up -d` brings up all three infra containers healthy.

---

## Phase 1 — Shared contracts (the load-bearing phase)

Goal: the interfaces every later phase depends on. Get these right and DIP/ISP/LSP hold automatically for everything built after.

- [ ] 1.1 `packages/asset-contracts`: base `Asset` type (id, org_id, fleet_id, type, plugin metadata)
- [ ] 1.2 `packages/asset-contracts`: role interfaces — `Locatable` (lat/lng/heading), `Monitorable` (health score, telemetry fields), `Alertable` (alert thresholds/state), `Communicable` (channel binding), `Taskable` (assignable to a Mission/Task) — each interface independently importable (ISP)
- [ ] 1.3 `packages/asset-contracts`: `getMapIcon()`/`getDisplayLabel()`-style methods defined on the interface so `map`/`board` never need `if (asset.type === 'vehicle')` (OCP/LSP)
- [ ] 1.4 `packages/event-schemas`: event payload types — `AssetLocationUpdated`, `AssetHealthChanged`, `AlertRaised`, `TaskSuggested`, `MessagePosted` — plus runtime validators (zod) so a malformed event fails at the publish boundary, not deep in a consumer
- [ ] 1.5 `packages/event-schemas`: `EventPublisher`/`EventSubscriber` port interfaces (abstract — no NATS import here) so services depend on the port, not the transport (DIP)
- [ ] 1.6 `packages/event-bus-nats`: the one concrete adapter implementing those ports against NATS — the only package allowed to `import nats`
- [ ] 1.7 Unit tests: contract compilation tests (a fixture "TestAsset" implementing all five interfaces) + event schema validators (valid/invalid payload cases)

**Acceptance:** `pnpm --filter @gamopls/asset-contracts build` and `pnpm --filter @gamopls/event-schemas test` pass; no package outside `event-bus-nats` has `nats` as a dependency.

---

## Phase 2 — Vehicle plugin (first concrete implementation)

Goal: prove the contracts are implementable before building four services against them blind.

- [ ] 2.1 `plugins/asset-vehicle`: `Vehicle` class implementing all five role interfaces from `asset-contracts`
- [ ] 2.2 `VehicleDetails` schema/table (trip data, plate number, fuel type) — owned entirely by this plugin, referenced by `asset_id` only, never joined into `board`'s Mission/Task tables
- [ ] 2.3 Plugin self-registration client: on boot, calls the registry (`services/registry`, see Phase 3.5) over HTTP/gRPC to announce `{type: 'vehicle', capabilities: [...]}` — no in-process loading
- [ ] 2.4 Unit tests: `Vehicle` satisfies `Locatable`/`Monitorable`/etc. via type-level + runtime assertion tests

**Acceptance:** a module service holding only an `Asset[]` (typed via `asset-contracts`) can render a vehicle's map icon and health score with zero knowledge that it's a vehicle.

---

## Phase 3 — Ingestion path + registry

Goal: get one real event flowing end-to-end through the bus before building four consumers.

- [ ] 3.1 `plugins/ingestion-edgebox`: Edge Box MQTT payload parser → normalized `AssetLocationUpdated`/`AssetHealthChanged` DTOs (protocol-specific parsing lives here, nowhere else)
- [ ] 3.2 `services/core-ingestion` (Go): MQTT subscriber → calls into `ingestion-edgebox` adapter (via network/plugin protocol, not Go-plugin-load) → publishes normalized events to NATS
- [ ] 3.3 A local MQTT simulator script (`infra/simulators/edgebox-sim`) that publishes fake telemetry, for dev/testing without real hardware
- [ ] 3.4 `services/core-ingestion` unit tests: raw payload → normalized event, malformed payload → dropped + logged (not crashed)
- [ ] 3.5 `services/registry` (NestJS, minimal): plugin self-registration endpoint + in-memory/Postgres-backed registry table, read API for "what asset types/capabilities exist"

**Acceptance:** running the simulator produces `AssetLocationUpdated` events visible on a NATS subscriber CLI, with `org_id`/`fleet_id` populated on every event.

---

## Phase 4 — Module services (parallelizable once Phase 1–3 land)

Each service is its own sub-problem and can be built in parallel by different people — that's the point of SRP. Each gets its own bullet list; none may import `plugins/asset-vehicle`.

**4.1 `services/map`**
- [ ] Subscribe to `AssetLocationUpdated`; maintain live position cache (Redis)
- [ ] Geofence CRUD + geofence-exit detection → publish `AlertRaised`
- [ ] REST + WebSocket API for "current asset positions for fleet X" (sync read, allowed to be called directly by `apps/web`)
- [ ] Renders markers using `asset.getMapIcon()` — never branches on type

**4.2 `services/chat`**
- [ ] Mission channel CRUD, message CRUD, media reference storage (pointer only, not blob)
- [ ] Subscribe to `AlertRaised` → auto-post system message to the relevant mission channel
- [ ] No direct calls to `map`/`board` — channel-to-mission linkage via `mission_id`, resolved through events/read APIs only

**4.3 `services/board`**
- [ ] `Mission`/`Task` tables — **asset-type-agnostic**, no vehicle fields (rule from CLAUDE.md, enforced via schema review)
- [ ] Task assignment against any `Taskable` asset
- [ ] Subscribe to `TaskSuggested` (from `ai-engine` later) → create draft task
- [ ] Hosts AI Agent plugin registration (same registry pattern as asset plugins)

**4.4 `services/hub`**
- [ ] Document upload/storage + metadata
- [ ] RAG search stub (interface only in V1 if `ai-engine` embeddings aren't ready yet — don't block on it)

**Acceptance per service:** each has its own test suite, runs standalone (`pnpm --filter <name> dev`) against only Postgres/Redis/NATS + `packages/*` — no other service needs to be running.

---

## Phase 5 — AI engine skeleton (`services/ai-engine`, Python)

- [ ] 5.1 Health score calculation from `AssetHealthChanged` telemetry → publishes updated `AssetHealthChanged` with computed score (not raw passthrough)
- [ ] 5.2 LangGraph agent skeleton (single node) that can later grow into predictive maintenance — stub it as a no-op passthrough first, don't over-build
- [ ] 5.3 `TaskSuggested` publishing when health score crosses a threshold (feeds `board` 4.3)

**Acceptance:** simulator → ingestion → ai-engine → board produces a draft task for a degraded-health vehicle, no direct service-to-service calls involved.

---

## Phase 6 — `apps/web` (dashboard)

- [ ] 6.1 Next.js app scaffold, using `packages/ui` for shared components
- [ ] 6.2 Auth: JWT issuance/validation (`packages/auth`), org_id/fleet_id claims
- [ ] 6.3 Gateway layer (route handlers or `services/registry`-adjacent gateway, per Open Decision #2) enforcing org/fleet scoping **before** any request reaches `map`/`chat`/`board`/`hub`
- [ ] 6.4 MAP view (live positions via `map` WebSocket API)
- [ ] 6.5 CHAT view (mission channels via `chat` REST API)
- [ ] 6.6 BOARD view (tasks via `board` REST API)
- [ ] 6.7 HUB view (documents via `hub` REST API)

**Acceptance:** a logged-in user only ever sees assets/missions/documents scoped to their `org_id`/`fleet_id`, verified with a two-tenant integration test (tenant A can never fetch tenant B's data even with a guessed ID).

---

## Phase 7 — Integration, hardening, CI gate

- [ ] 7.1 End-to-end happy path test: simulator → ingestion → NATS → map+board+chat updated → visible in `apps/web`
- [ ] 7.2 Contract tests: assert no `services/*` package.json has `plugins/asset-vehicle` as a dependency (lint rule or CI script — turns the architecture rule into something enforced, not just documented)
- [ ] 7.3 Load test the ingestion path against expected Chennai pilot fleet size
- [ ] 7.4 `docs/architecture/GAMOPLS_TeamCore_Platform_Architecture.md` — write this now that Phase 0–6 decisions are real, since it doesn't exist yet and CLAUDE.md references it as the source of truth

**Acceptance:** CI fails if a module service ever imports a concrete plugin — this is the automated backstop for the architecture rule, not just a code-review reminder.

---

## Phase 8 — Fleet operations UX (post-V1, in progress)

Goal: make the platform usable by a non-technical fleet operator day-to-day — onboarding vehicles/drivers, seeing them on a real map, and eventually turning raw telemetry into money saved (maintenance timing, fuel efficiency, idle time). Decomposed into four sub-projects, each with its own spec → plan → implementation cycle rather than one giant design (per `superpowers:brainstorming`'s decomposition rule) — see `docs/superpowers/specs/` and `docs/superpowers/plans/`.

- [ ] 8.0 UI/UX restyle — two-theme (light "Clarity" / dark "Neutral") token-based color system across `apps/web`, replacing the ad-hoc hardcoded Tailwind color classes from the earlier dashboard pass. Spec: `docs/superpowers/specs/2026-07-09-ui-ux-restyle-design.md`.
- [x] 8.A Fleet, vehicle & driver management — new `services/fleet` owning `Fleet`/`Driver`/base `Asset` registry/`DriverAssignment` history (full history, not just current-driver pointer); `plugins/asset-vehicle` gains an HTTP API so `services/fleet` reaches it only over the network, never by import. Vehicle onboarding is a single flat form (plate + type + fuel required, everything else collapsed under "more details"), pattern adapted from a sibling app's vehicle-form UX. Spec: `docs/superpowers/specs/2026-07-09-fleet-vehicle-driver-management-design.md`. Plan: `docs/superpowers/plans/2026-07-09-fleet-vehicle-driver-management.md`. **Implemented, reviewed, merged.**
- [x] 8.B Interactive map with clickable markers — Leaflet + OpenStreetMap (no API key), marker popup showing health/fuel/odometer at a glance, geofence circles, "More details" link. Frontend-only — `services/map`/`services/fleet` already exposed everything needed. Spec: `docs/superpowers/specs/2026-07-09-interactive-map-design.md`. Plan: `docs/superpowers/plans/2026-07-09-interactive-map.md`. **Implemented, reviewed, merged.**
- [x] 8.C Advanced vehicle dashboard ("digital twin") — SVG vehicle silhouette with 4 colored hotspots (engine/battery/fuel/overall), each driven by its own telemetry reading and thresholds, honest "No data" for missing readings rather than fabricated values. Spec: `docs/superpowers/specs/2026-07-09-digital-twin-dashboard-design.md`. Plan: `docs/superpowers/plans/2026-07-09-digital-twin-dashboard.md`. **Implemented, reviewed, merged.**
- [ ] 8.D Maintenance & fleet optimization — the actual money-saving layer for operators (Delhivery/cab/courier-style fleets):
  - **Multi-sensor plugin extensibility**: additional Ingestion Plugins (camera, dashcam, independent GPS/mileage trackers) alongside `plugins/ingestion-edgebox`, each publishing into the same `AssetHealthChanged`/`AssetLocationUpdated` event shapes. No module service changes needed — `Monitorable.telemetry` is already an opaque bag for exactly this reason (`packages/asset-contracts/src/monitorable.ts`).
  - **Service-due-by-mileage**: `MaintenanceRecord` (what part, when, at what odometer) + `ServiceSchedule` (e.g. every 10,000 km), compared against live `odometer_km` telemetry → raises `TaskSuggested` (event already exists) → `services/board` auto-creates a draft task, mirroring the existing AI health-score-threshold flow.
  - **Fuel efficiency (km/l) + idle-time detection**: computed from deltas between successive `AssetHealthChanged` readings (odometer change ÷ fuel consumed; `speed_kmh ≈ 0` sustained = idle). Natural home is `services/ai-engine` (Phase 5) as a sibling job to the existing health-score computation.
  - Depends on 8.A (needs `Asset`/telemetry persistence to exist) and real ingested telemetry to validate calculations against — not yet spec'd; brainstorm after 8.A is implemented and flowing real data.

**Acceptance per sub-project:** each ships independently — 8.A doesn't block on 8.B/8.C/8.D being designed, and each gets its own working, testable slice per its plan's task list.

---

## Suggested build order

Phase 0 → 1 → 2 → 3 are sequential (each is a real dependency of the next). Phase 4's four services can run in parallel once 1–3 are done. Phase 5 can start in parallel with Phase 4 (only needs event schemas). Phase 6 needs at least one of Phase 4's services to have a real API to point at — start with `map` since it's the most demo-able. Phase 7 is continuous, not a final step — 7.2's CI guard should land as soon as Phase 4 starts, not after. Phase 8 starts once Phase 6 (dashboard) is live; 8.A is the current focus, 8.B/8.C/8.D queue behind it in order since each depends on the previous sub-project's data or entry point existing.
