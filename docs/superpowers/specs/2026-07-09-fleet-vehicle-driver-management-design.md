# Fleet, Vehicle & Driver Management — Design

## Context

This is sub-project A of a three-part plan (A: fleet/vehicle/driver management → B: interactive map with clickable markers → C: advanced vehicle dashboard/digital twin), scoped down from a broader "make the app usable by non-technical fleet operators" request. See the two sibling repos surveyed for reference (`/Users/vaibhaw/Developer/Gamopls/GamoplsPartner`, `/Users/vaibhaw/Developer/Gamopls/GarageApp`) — neither has a real "org owns many fleets, each fleet has vehicles + drivers" concept or a driver model, but `GarageApp`'s `FillVehicleDetailsScreen.js` (flat single-page form, chip-select for enum fields) is a useful UX pattern to adapt, and its field set (name, model, year, color, VIN, plate, engine, fuel, transmission) informs the `VehicleDetails` extension below.

Today, none of this exists in `GamoplsApp`:
- No `Fleet` entity — `fleet_id` is only a JWT claim, never a row anywhere.
- No `Driver` entity at all.
- No base `Asset` table — `plugins/asset-vehicle`'s `VehicleDetails` table has an `asset_id` foreign key that nothing ever creates.
- No API to onboard a vehicle from the UI.
- `AssetHealthChanged` events (health score + sensor telemetry — battery %, engine temp, fuel %, odometer) are published over NATS by the ingestion path but nothing persists or exposes the latest snapshot per asset.

## Goals

1. An org can create and manage **multiple fleets**.
2. A non-technical user can **add a vehicle** to a fleet through a simple form.
3. A non-technical user can **add a driver** to a fleet and **assign them to a vehicle**, with the assignment history retained (who drove what, when).
4. Each vehicle shows its **live health snapshot** — health score + the individual sensor readings (fuel %, battery %, engine temp, odometer) coming from the Edge Box — sourced from the existing `AssetHealthChanged` event stream, not re-invented.
5. Code follows this repo's SOLID mapping (see `CLAUDE.md`): new domain logic gets a repository/service split (SRP), module services depend only on `packages/asset-contracts`/`packages/event-schemas` (DIP), vehicle-specific storage stays inside `plugins/asset-vehicle` and is reached only over HTTP (OCP — new asset types plug in the same way later).

## Non-goals

- No map UI, no marker click-through (sub-project B).
- No digital twin / advanced diagnostics screen (sub-project C).
- No multi-driver-per-vehicle-at-once, no maintenance/scheduling logic beyond assignment history.
- No changes to `services/map`, `services/board`, `services/chat`, `services/hub` beyond what's listed below.

## Architecture

### New service: `services/fleet` (NestJS, matching sibling services)

Owns three things, each behind its own repository (SRP):

- **Fleet** — `id, org_id, name, created_at, updated_at`. An org has many fleets.
- **Driver** — `id, org_id, fleet_id, name, phone, license_number, status ('active'|'inactive'), created_at, updated_at`.
- **Asset registry** — the base identity row every plugin's detail table hangs off: `id, org_id, fleet_id, type, display_label, health_score, telemetry (jsonb), telemetry_updated_at, created_at, updated_at`. This is the durable counterpart to the in-memory `Vehicle` class's `Asset`/`Monitorable` fields — `services/fleet` is the system of record for "what assets exist," `services/map` remains the system of record for "where they currently are" (Redis, ephemeral, unchanged).
- **DriverAssignment** — history table: `id, org_id, fleet_id, asset_id, driver_id, assigned_at, unassigned_at (nullable)`. "Current driver" for a vehicle = the assignment row with `unassigned_at IS NULL`; assigning a new driver closes the open row and opens a new one in the same transaction.

`services/fleet` subscribes to `AssetHealthChanged` (via the existing `EventSubscriber` port from `packages/event-schemas` — no direct NATS import, per DIP) and upserts `Asset.health_score`/`telemetry`/`telemetry_updated_at` on receipt. This is the same pattern `services/map` already uses for `AssetLocationUpdated`, just persisted instead of cached.

**Vehicle onboarding orchestration**: `POST /assets` on `services/fleet` does two things inside one logical operation (not a DB transaction spanning services — these are separate deployable services per CLAUDE.md):
1. Insert the base `Asset` row (`id, org_id, fleet_id, type: 'vehicle'`).
2. Call `plugins/asset-vehicle`'s new HTTP API (see below) to create the `VehicleDetails` row for that `asset_id`.

If step 2 fails, step 1's row is deleted (compensating action) so we don't leave an orphaned Asset with no vehicle details — simple saga, no distributed transaction machinery needed at this scale.

### `plugins/asset-vehicle` gets an HTTP API

Today this plugin is a pure library (`Vehicle` class + `VehicleDetails` type), imported nowhere except tests. Per CLAUDE.md, `services/fleet` must never `import` it directly — so it needs to become a small deployable Fastify service (matching `services/map`'s `build-app.ts`/`server.ts` split) exposing:

- `POST /vehicle-details` — create (called by `services/fleet` during onboarding)
- `GET /vehicle-details/:assetId` — read
- `PATCH /vehicle-details/:assetId` — update (e.g. odometer correction, trip fields)

`VehicleDetails` gains three fields found useful in the `GarageApp` survey: `color: string | null`, `year: string | null`, `vin: string | null` (alongside the existing `plateNumber`, `make`, `model`).

### Why this doesn't violate the architecture rules

- `services/fleet` depends only on `packages/asset-contracts` (for the `Asset`/`Monitorable` shape it persists) and `packages/event-schemas` (for `AssetHealthChanged`) — never on `plugins/asset-vehicle`'s TypeScript types, only its HTTP contract.
- `plugins/asset-vehicle` remains a separate deployable service, self-registers with `services/registry` the same way it already plans to (Phase 2.3 of `PLAN.md`), just now also serves its own CRUD API.
- Driver/Fleet/Asset-registry data is asset-type-agnostic and lives in `services/fleet`, not the vehicle plugin — a future drone plugin reuses the same `services/fleet` Asset registry without any change there.

## Data model (Prisma additions to `packages/db/prisma/schema.prisma`)

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

model Driver {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_id         String
  fleet_id       String
  name           String
  phone          String?
  license_number String?
  status         String   @default("active") // 'active' | 'inactive'
  created_at     DateTime @default(now()) @db.Timestamptz()
  updated_at     DateTime @default(now()) @updatedAt @db.Timestamptz()

  assignments DriverAssignment[]

  @@index([org_id, fleet_id])
  @@map("drivers")
}

model Asset {
  id                  String    @id @db.Uuid
  org_id              String
  fleet_id            String
  type                String // 'vehicle' today; other Asset Type Plugins later
  display_label       String
  health_score        Int       @default(100)
  telemetry           Json      @default("{}")
  telemetry_updated_at DateTime?
  created_at          DateTime  @default(now()) @db.Timestamptz()
  updated_at          DateTime  @default(now()) @updatedAt @db.Timestamptz()

  assignments DriverAssignment[]

  @@index([org_id, fleet_id])
  @@map("assets")
}

model DriverAssignment {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_id        String
  fleet_id      String
  asset_id      String    @db.Uuid
  driver_id     String    @db.Uuid
  assigned_at   DateTime  @default(now()) @db.Timestamptz()
  unassigned_at DateTime? @db.Timestamptz()

  asset  Asset  @relation(fields: [asset_id], references: [id], onDelete: Cascade)
  driver Driver @relation(fields: [driver_id], references: [id], onDelete: Cascade)

  @@index([asset_id, unassigned_at])
  @@index([org_id, fleet_id])
  @@map("driver_assignments")
}
```

Plus, in `plugins/asset-vehicle`'s existing `VehicleDetails` Prisma model: add `color String?`, `year String?`, `vin String?`.

## API surface

**`services/fleet`** (REST, org/fleet scoped via the existing gateway-proxy pattern — no ad-hoc `WHERE org_id = ...` as the only defense, per CLAUDE.md):

- `POST /fleets`, `GET /fleets` — create/list fleets for the caller's org
- `POST /drivers`, `GET /drivers?fleet_id=`, `PATCH /drivers/:id` — driver CRUD
- `POST /assets`, `GET /assets?fleet_id=`, `GET /assets/:id` — vehicle onboarding + list + detail (detail response joins the base Asset row, the current `DriverAssignment`, and calls through to `plugins/asset-vehicle`'s `GET /vehicle-details/:assetId` to compose the full picture)
- `POST /assets/:id/assignments` `{ driver_id }` — assign a driver (closes any open assignment for that asset first, in a transaction)
- `DELETE /assets/:id/assignments/current` — unassign (sets `unassigned_at`)
- `GET /assets/:id/assignments` — history

**`plugins/asset-vehicle`**: `POST /vehicle-details`, `GET /vehicle-details/:assetId`, `PATCH /vehicle-details/:assetId` (internal, called only by `services/fleet`, not exposed through the gateway).

## Frontend (`apps/web`)

- **Fleet switcher**: replace the static `fleet: {session.fleet_id}` badge in `app/layout.tsx`'s header with a dropdown listing the org's fleets (from `GET /fleets`), switching updates the active fleet context (stored the same way `session` currently is — cookie-based, matching `lib/session.ts`'s existing pattern).
- **New nav section** "Fleet" (alongside Map/Chat/Board/Hub) with two tabs:
  - **Vehicles** — list (table, matching `AssetPositionsTable`'s existing style) + "Add Vehicle" button opening a form modeled on `MissionForm.tsx`'s pattern (plain `useState`, no new form library): plate, type (segmented `<select>` control, not free text — mirrors `GarageApp`'s chip-select pattern), fuel type (segmented control), make/model/color/year/VIN (optional text fields, collapsed under a "More details" disclosure so the required path stays to 2 fields: plate + type). Each row shows live health score + fuel/battery from the `Asset.telemetry` snapshot once `services/fleet`'s subscription is wired up.
  - **Drivers** — list + "Add Driver" form (name, phone, license — name is the only required field) + an assign-to-vehicle control per driver (dropdown of unassigned/reassignable vehicles) that calls the assignment endpoint; each vehicle row's detail view shows its assignment history.
- New API client module `apps/web/components/fleet/api.ts`, following the existing `MapApiError`/`parseOrThrow` pattern from `components/map/api.ts`, proxied through a new `app/api/fleet/[...path]/route.ts` gateway route handler (mirrors the existing `app/api/map/[...path]/route.ts`).

## Testing

- `services/fleet`: repository unit tests (in-memory + Postgres, matching `services/board`'s `in-memory-repository.ts`/`postgres-repository.ts` dual pattern) for Fleet/Driver/Asset/DriverAssignment CRUD, plus a test that assigning a new driver closes the previous open assignment.
- `plugins/asset-vehicle`: unit tests for the new HTTP handlers (Fastify `inject()`, matching `services/map`'s test style).
- `apps/web`: component tests for the Vehicles/Drivers list + forms, following the existing `BoardView.test.tsx`/`ChatView.test.tsx` pattern (mock the API module, assert on loading/error/success states).
