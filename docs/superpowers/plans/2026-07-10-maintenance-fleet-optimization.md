# Maintenance & Fleet Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-suggest maintenance tasks when a service interval is crossed by odometer reading, compute and surface fuel efficiency (km/L) honestly (skipping across refuels), and raise an alert when a vehicle idles too long.

**Architecture:** `plugins/asset-vehicle` gains a `MaintenanceRecord` entity + HTTP API (mirrors the existing `VehicleDetails` pattern exactly). `services/fleet` owns the service-due decision and dedup bookkeeping (`MaintenanceSuggestion` table) plus the mileage calculation, both folded into its existing `AssetHealthChanged` subscription, and gains an `EventPublisher` (the same `NatsEventBus` instance already implements both ports) to publish `TaskSuggested`. `services/ai-engine` (Python) gains a second event subscription (`AssetLocationUpdated`) and an in-memory idle-detection state machine publishing `AlertRaised`. `apps/web` gets a Maintenance card + mileage display on the existing vehicle detail page.

**Tech Stack:** Same as prior sub-projects — Fastify+Zod+Prisma (TS services), Pydantic (`ai-engine`), Next.js/React (`apps/web`).

## Global Constraints

- `services/fleet` never imports `plugins/asset-vehicle` directly — only via `VehiclePluginClient` over HTTP.
- Every new repository method is tenant-scoped by `org_id`/`fleet_id` where applicable (mirrors every prior sub-project's pattern).
- Never fabricate a value: mileage is `null` (not a guess) when `fuelCapacityLiters` is unknown or a refuel happened in the delta window; a hotspot/field with no backing data shows "No data"/"—", matching the digital twin's established honesty rule.
- `services/ai-engine` communicates only via the event bus — no direct calls to `services/fleet`/`services/board`/etc.

---

### Task 1: Prisma schema — `MaintenanceRecord`, `MaintenanceSuggestion`, `Asset.last_mileage_kmpl`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Produces: `MaintenanceRecord` (plugin-owned), `MaintenanceSuggestion` (fleet-owned dedup bookkeeping), and a new nullable `last_mileage_kmpl` column on the existing `Asset` model. All later tasks depend on the generated Prisma client having these.

- [ ] **Step 1: Append `MaintenanceRecord` to the plugin section**

Add to the end of `packages/db/prisma/schema.prisma`, after the existing `VehicleDetails` model:

```prisma
model MaintenanceRecord {
  id                     String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  asset_id               String   @db.Uuid
  service_type           String   // 'oil_change' | 'brake_inspection' | 'tire_rotation' | 'general_service'
  performed_at           DateTime @db.Timestamptz()
  odometer_at_service_km Decimal  @db.Decimal
  created_at             DateTime @default(now()) @db.Timestamptz()

  @@index([asset_id, service_type])
  @@map("maintenance_records")
}
```

- [ ] **Step 2: Add `MaintenanceSuggestion` to the fleet section and extend `Asset`**

In the `model Asset { ... }` block, add after `telemetry_updated_at DateTime?`:

```prisma
  last_mileage_kmpl   Decimal?  @db.Decimal
```

Add a new model directly after the existing `DriverAssignment` model (still within the `services/fleet` section):

```prisma
model MaintenanceSuggestion {
  id                       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  org_id                   String
  fleet_id                 String
  asset_id                 String   @db.Uuid
  service_type             String
  suggested_at_odometer_km Decimal  @db.Decimal
  created_at               DateTime @default(now()) @db.Timestamptz()
  updated_at               DateTime @default(now()) @updatedAt @db.Timestamptz()

  @@unique([asset_id, service_type])
  @@index([org_id, fleet_id])
  @@map("maintenance_suggestions")
}
```

- [ ] **Step 3: Generate and apply the migration**

Run: `pnpm --filter @gamopls/db db:migrate -- --name add_maintenance_records_and_mileage`
Expected: output ends with `Your database is now in sync with your schema.` (a local Postgres must be reachable — reuse the `gamopls-postgres-temp` container from the earlier sub-project if it's still running; if not, `docker run --name gamopls-postgres-temp -e POSTGRES_USER=gamopls -e POSTGRES_PASSWORD=changeme -e POSTGRES_DB=gamopls_teamcore -p 5432:5432 -d postgres:16` first, matching `.env.example`'s `DATABASE_URL`).

- [ ] **Step 4: Regenerate the Prisma client and verify**

Run: `pnpm --filter @gamopls/db db:generate`
Then verify: `node -e "const {PrismaClient} = require('@gamopls/db'); const p = new PrismaClient(); console.log(typeof p.maintenanceRecord, typeof p.maintenanceSuggestion)"` from `packages/db` — expect `object object`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma
git commit -m "feat(db): add MaintenanceRecord, MaintenanceSuggestion, Asset.last_mileage_kmpl"
```

---

### Task 2: `plugins/asset-vehicle` — `MaintenanceRecord` repository + HTTP API

**Files:**
- Create: `plugins/asset-vehicle/src/maintenance-record.ts`
- Create: `plugins/asset-vehicle/src/maintenance-record-repository.ts`
- Create: `plugins/asset-vehicle/src/in-memory-maintenance-record-repository.ts`
- Create: `plugins/asset-vehicle/src/prisma-maintenance-record-repository.ts`
- Modify: `plugins/asset-vehicle/src/schemas.ts` (add maintenance schemas)
- Modify: `plugins/asset-vehicle/src/build-app.ts` (add routes)
- Modify: `plugins/asset-vehicle/src/index.ts` (export new symbols)
- Test: `plugins/asset-vehicle/src/__tests__/maintenance-record.test.ts`
- Test: `plugins/asset-vehicle/src/__tests__/build-app.test.ts` (extend)

**Interfaces:**
- Produces: `MaintenanceRecord` type (`id, assetId, serviceType, performedAt, odometerAtServiceKm, createdAt`), `MaintenanceRecordRepository` (`create`, `list(assetId)`), routes `POST /maintenance-records`, `GET /maintenance-records/:assetId`. `services/fleet` (Task 3) calls this HTTP contract via a new `VehiclePluginClient` method.

- [ ] **Step 1: Write the type**

Create `plugins/asset-vehicle/src/maintenance-record.ts`:

```typescript
export type ServiceType = "oil_change" | "brake_inspection" | "tire_rotation" | "general_service";

export interface MaintenanceRecord {
  id: string;
  assetId: string;
  serviceType: ServiceType;
  performedAt: string;
  odometerAtServiceKm: number;
  createdAt: string;
}
```

- [ ] **Step 2: Add Zod schemas**

Append to `plugins/asset-vehicle/src/schemas.ts`:

```typescript
export const serviceTypeSchema = z.enum(["oil_change", "brake_inspection", "tire_rotation", "general_service"]);

export const createMaintenanceRecordInputSchema = z.object({
  assetId: z.string().min(1),
  serviceType: serviceTypeSchema,
  performedAt: z.string().datetime(),
  odometerAtServiceKm: z.number().min(0),
});
export type CreateMaintenanceRecordInput = z.infer<typeof createMaintenanceRecordInputSchema>;
```

- [ ] **Step 3: Write the failing repository test**

Create `plugins/asset-vehicle/src/__tests__/maintenance-record.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { InMemoryMaintenanceRecordRepository } from "../in-memory-maintenance-record-repository.js";

describe("InMemoryMaintenanceRecordRepository", () => {
  it("creates records and lists them for an asset, most recent first", async () => {
    const repo = new InMemoryMaintenanceRecordRepository();
    await repo.create({
      assetId: "asset-1",
      serviceType: "oil_change",
      performedAt: "2026-01-01T00:00:00.000Z",
      odometerAtServiceKm: 5000,
    });
    await repo.create({
      assetId: "asset-1",
      serviceType: "oil_change",
      performedAt: "2026-06-01T00:00:00.000Z",
      odometerAtServiceKm: 15000,
    });
    await repo.create({
      assetId: "asset-2",
      serviceType: "oil_change",
      performedAt: "2026-01-01T00:00:00.000Z",
      odometerAtServiceKm: 3000,
    });

    const records = await repo.list("asset-1");
    expect(records).toHaveLength(2);
    expect(records[0].odometerAtServiceKm).toBe(15000); // most recent first
  });

  it("returns an empty list for an asset with no records", async () => {
    const repo = new InMemoryMaintenanceRecordRepository();
    expect(await repo.list("nonexistent")).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @gamopls/asset-vehicle test -- maintenance-record`
Expected: FAIL — `Cannot find module '../in-memory-maintenance-record-repository.js'`.

- [ ] **Step 5: Write the repository port + in-memory implementation**

Create `plugins/asset-vehicle/src/maintenance-record-repository.ts`:

```typescript
import type { MaintenanceRecord } from "./maintenance-record.js";
import type { CreateMaintenanceRecordInput } from "./schemas.js";

export interface MaintenanceRecordRepository {
  create(input: CreateMaintenanceRecordInput): Promise<MaintenanceRecord>;
  list(assetId: string): Promise<MaintenanceRecord[]>;
}
```

Create `plugins/asset-vehicle/src/in-memory-maintenance-record-repository.ts`:

```typescript
import { randomUUID } from "node:crypto";
import type { MaintenanceRecord } from "./maintenance-record.js";
import type { MaintenanceRecordRepository } from "./maintenance-record-repository.js";
import type { CreateMaintenanceRecordInput } from "./schemas.js";

export class InMemoryMaintenanceRecordRepository implements MaintenanceRecordRepository {
  private readonly rows: MaintenanceRecord[] = [];

  async create(input: CreateMaintenanceRecordInput): Promise<MaintenanceRecord> {
    const record: MaintenanceRecord = {
      id: randomUUID(),
      assetId: input.assetId,
      serviceType: input.serviceType,
      performedAt: input.performedAt,
      odometerAtServiceKm: input.odometerAtServiceKm,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(record);
    return record;
  }

  async list(assetId: string): Promise<MaintenanceRecord[]> {
    return this.rows
      .filter((r) => r.assetId === assetId)
      .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @gamopls/asset-vehicle test -- maintenance-record`
Expected: PASS, 2 tests.

- [ ] **Step 7: Write the Prisma implementation**

Create `plugins/asset-vehicle/src/prisma-maintenance-record-repository.ts`:

```typescript
import type { PrismaClient } from "@gamopls/db";
import type { MaintenanceRecord } from "./maintenance-record.js";
import type { MaintenanceRecordRepository } from "./maintenance-record-repository.js";
import type { CreateMaintenanceRecordInput } from "./schemas.js";

export class PrismaMaintenanceRecordRepository implements MaintenanceRecordRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(db: any): MaintenanceRecord {
    return {
      id: db.id,
      assetId: db.asset_id,
      serviceType: db.service_type,
      performedAt: db.performed_at.toISOString(),
      odometerAtServiceKm: Number(db.odometer_at_service_km),
      createdAt: db.created_at.toISOString(),
    };
  }

  async create(input: CreateMaintenanceRecordInput): Promise<MaintenanceRecord> {
    const db = await this.prisma.maintenanceRecord.create({
      data: {
        asset_id: input.assetId,
        service_type: input.serviceType,
        performed_at: new Date(input.performedAt),
        odometer_at_service_km: input.odometerAtServiceKm,
      },
    });
    return this.map(db);
  }

  async list(assetId: string): Promise<MaintenanceRecord[]> {
    const rows = await this.prisma.maintenanceRecord.findMany({
      where: { asset_id: assetId },
      orderBy: { performed_at: "desc" },
    });
    return rows.map((r: any) => this.map(r));
  }
}
```

- [ ] **Step 8: Add HTTP routes**

In `plugins/asset-vehicle/src/build-app.ts`, add imports:

```typescript
import { InMemoryMaintenanceRecordRepository } from "./in-memory-maintenance-record-repository.js";
import type { MaintenanceRecordRepository } from "./maintenance-record-repository.js";
import { createMaintenanceRecordInputSchema } from "./schemas.js";
```

Update `BuildAppOptions` and the top of `buildApp`:

```typescript
export interface BuildAppOptions {
  repo?: VehicleDetailsRepository;
  maintenanceRepo?: MaintenanceRecordRepository;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const repo = options.repo ?? new InMemoryVehicleDetailsRepository();
  const maintenanceRepo = options.maintenanceRepo ?? new InMemoryMaintenanceRecordRepository();
```

Add before the final `return app;`:

```typescript
  app.post("/maintenance-records", async (request, reply) => {
    const parsed = createMaintenanceRecordInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid payload", details: parsed.error.flatten() });
    }
    const record = await maintenanceRepo.create(parsed.data);
    return reply.status(201).send(record);
  });

  app.get("/maintenance-records/:assetId", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const records = await maintenanceRepo.list(assetId);
    return reply.status(200).send({ records });
  });
```

- [ ] **Step 9: Extend the build-app test**

Append to the `describe` block in `plugins/asset-vehicle/src/__tests__/build-app.test.ts`:

```typescript
  it("creates and lists maintenance records for an asset", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/maintenance-records",
      payload: {
        assetId: "asset-1",
        serviceType: "oil_change",
        performedAt: "2026-06-01T00:00:00.000Z",
        odometerAtServiceKm: 15000,
      },
    });
    expect(createRes.statusCode).toBe(201);

    const listRes = await app.inject({ method: "GET", url: "/maintenance-records/asset-1" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().records).toHaveLength(1);
    expect(listRes.json().records[0].serviceType).toBe("oil_change");
  });
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `pnpm --filter @gamopls/asset-vehicle test`
Expected: all PASS (existing + 3 new tests).

- [ ] **Step 11: Export new symbols**

Append to `plugins/asset-vehicle/src/index.ts`:

```typescript
export type { MaintenanceRecord, ServiceType } from "./maintenance-record.js";
export type { MaintenanceRecordRepository } from "./maintenance-record-repository.js";
export { InMemoryMaintenanceRecordRepository } from "./in-memory-maintenance-record-repository.js";
export { PrismaMaintenanceRecordRepository } from "./prisma-maintenance-record-repository.js";
export { serviceTypeSchema, createMaintenanceRecordInputSchema } from "./schemas.js";
export type { CreateMaintenanceRecordInput } from "./schemas.js";
```

- [ ] **Step 12: Wire the Prisma repo into `server.ts`**

In `plugins/asset-vehicle/src/server.ts`, add:

```typescript
import { InMemoryMaintenanceRecordRepository } from "./in-memory-maintenance-record-repository.js";
import { PrismaMaintenanceRecordRepository } from "./prisma-maintenance-record-repository.js";
import type { MaintenanceRecordRepository } from "./maintenance-record-repository.js";
```

Add a second typed variable and branch, mirroring the existing `repo` variable exactly:

```typescript
let maintenanceRepo: MaintenanceRecordRepository;
if (databaseUrl) {
  maintenanceRepo = new PrismaMaintenanceRecordRepository(getPrismaClient());
} else {
  maintenanceRepo = new InMemoryMaintenanceRecordRepository();
}
```

Update the `buildApp({ repo })` call to `buildApp({ repo, maintenanceRepo })`.

- [ ] **Step 13: Run full package test suite and typecheck**

Run: `pnpm --filter @gamopls/asset-vehicle test && pnpm --filter @gamopls/asset-vehicle exec tsc --noEmit -p .`
Expected: all PASS, no type errors.

- [ ] **Step 14: Commit**

```bash
git add plugins/asset-vehicle
git commit -m "feat(asset-vehicle): add MaintenanceRecord repository and HTTP API"
```

---

### Task 3: `services/fleet` — service-due suggestions + fuel efficiency

**Files:**
- Modify: `services/fleet/src/vehicle-plugin-client.ts` (add maintenance methods)
- Create: `services/fleet/src/maintenance-suggestion-repository.ts`
- Create: `services/fleet/src/in-memory-maintenance-suggestion-repository.ts`
- Create: `services/fleet/src/prisma-maintenance-suggestion-repository.ts`
- Create: `services/fleet/src/service-intervals.ts`
- Modify: `services/fleet/src/asset-repository.ts` (extend `updateHealth` → also accept mileage; add `getPrevious`)
- Modify: `services/fleet/src/in-memory-asset-repository.ts`, `prisma-asset-repository.ts` (same)
- Modify: `services/fleet/src/health-subscription.ts` (service-due check + mileage calc)
- Modify: `services/fleet/src/build-app.ts` (proxy maintenance-record routes)
- Modify: `services/fleet/src/server.ts` (wire publisher into the subscription)
- Modify: `services/fleet/src/index.ts`
- Test: `services/fleet/src/__tests__/health-subscription.test.ts` (extend)
- Test: `services/fleet/src/__tests__/build-app.test.ts` (extend)

**Interfaces:**
- Consumes: `plugins/asset-vehicle`'s `POST /maintenance-records`, `GET /maintenance-records/:assetId` (Task 2's documented HTTP contract — mirror the exact request/response shapes from Task 2 Steps 1-2, 8 above; you do not need Task 2's code merged to write this, only its contract, same as every prior sub-project's parallel-track pattern).
- Produces: `subscribeAssetHealthChanged` gains two new optional params (`vehiclePluginClient`, `publisher`) and now also performs the service-due check and mileage calc. `GET/POST /api/fleet/assets/:id/maintenance-records` (proxied automatically by the existing `apps/web` catch-all gateway route — no `apps/web` change needed for the route itself).

- [ ] **Step 1: Add maintenance methods to `VehiclePluginClient`**

In `services/fleet/src/vehicle-plugin-client.ts`, add:

```typescript
export interface MaintenanceRecordResponse {
  id: string;
  assetId: string;
  serviceType: string;
  performedAt: string;
  odometerAtServiceKm: number;
  createdAt: string;
}
```

Add two methods to the `VehiclePluginClient` class:

```typescript
  async createMaintenanceRecord(input: {
    assetId: string;
    serviceType: string;
    performedAt: string;
    odometerAtServiceKm: number;
  }): Promise<MaintenanceRecordResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/maintenance-records`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new VehiclePluginClientError(`vehicle-plugin maintenance create failed: ${res.status}`, res.status);
    }
    return (await res.json()) as MaintenanceRecordResponse;
  }

  async getMaintenanceRecords(assetId: string): Promise<MaintenanceRecordResponse[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/maintenance-records/${assetId}`);
    if (!res.ok) {
      throw new VehiclePluginClientError(`vehicle-plugin maintenance list failed: ${res.status}`, res.status);
    }
    const body = (await res.json()) as { records: MaintenanceRecordResponse[] };
    return body.records;
  }
```

- [ ] **Step 2: Write the fixed service-interval constants**

Create `services/fleet/src/service-intervals.ts`:

```typescript
export const SERVICE_INTERVALS_KM: Record<string, number> = {
  oil_change: 10000,
  brake_inspection: 20000,
  tire_rotation: 10000,
  general_service: 15000,
};
```

- [ ] **Step 3: Write the failing test for the service-due + mileage logic**

Add to `services/fleet/src/__tests__/health-subscription.test.ts`:

```typescript
import { InMemoryAssetRepository } from "../in-memory-asset-repository.js";
import { InMemoryMaintenanceSuggestionRepository } from "../in-memory-maintenance-suggestion-repository.js";

class FakeVehiclePluginClientForHealth {
  constructor(
    private readonly maintenanceRecords: Record<string, { serviceType: string; odometerAtServiceKm: number }[]> = {},
    private readonly vehicleDetails: Record<string, { fuelCapacityLiters: number | null }> = {},
  ) {}
  async getMaintenanceRecords(assetId: string) {
    return (this.maintenanceRecords[assetId] ?? []).map((r) => ({
      id: "rec-1",
      assetId,
      performedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      ...r,
    }));
  }
  async getVehicleDetails(assetId: string) {
    const d = this.vehicleDetails[assetId];
    return d ? { assetId, fuelCapacityLiters: d.fuelCapacityLiters, plateNumber: "", vehicleType: "", fuelType: "", make: null, model: null, color: null, year: null, vin: null, odometerKm: 0 } : null;
  }
}

class FakePublisher {
  published: { subject: string; payload: unknown }[] = [];
  async publish(subject: string, payload: unknown) {
    this.published.push({ subject, payload });
  }
}

describe("subscribeAssetHealthChanged — service-due suggestions", () => {
  it("publishes TaskSuggested when odometer crosses a service interval with no prior record", async () => {
    const assetRepo = new InMemoryAssetRepository();
    const asset = await assetRepo.create({ org_id: "org-1", fleet_id: "fleet-1", type: "vehicle", display_label: "TN-01" });
    const suggestionRepo = new InMemoryMaintenanceSuggestionRepository();
    const vehiclePluginClient = new FakeVehiclePluginClientForHealth({}, {});
    const publisher = new FakePublisher();

    let handler: (payload: unknown) => Promise<void>;
    const fakeSubscriber = {
      subscribe: vi.fn(async (_subject: string, h: (payload: unknown) => Promise<void>) => {
        handler = h;
        return { unsubscribe: async () => {} };
      }),
    };

    await subscribeAssetHealthChanged(fakeSubscriber as any, assetRepo, {
      vehiclePluginClient: vehiclePluginClient as any,
      suggestionRepo,
      publisher: publisher as any,
    });

    await handler!({
      type: "AssetHealthChanged",
      org_id: "org-1",
      fleet_id: "fleet-1",
      timestamp: new Date().toISOString(),
      asset_id: asset.id,
      healthScore: 90,
      telemetry: { odometer_km: 12000 },
    });

    const suggested = publisher.published.find((p) => p.subject === "TaskSuggested");
    expect(suggested).toBeDefined();
    expect((suggested!.payload as any).title).toContain("oil_change");
  });

  it("does not re-suggest until another full interval passes", async () => {
    const assetRepo = new InMemoryAssetRepository();
    const asset = await assetRepo.create({ org_id: "org-1", fleet_id: "fleet-1", type: "vehicle", display_label: "TN-01" });
    const suggestionRepo = new InMemoryMaintenanceSuggestionRepository();
    await suggestionRepo.upsert("org-1", "fleet-1", asset.id, "oil_change", 12000);
    const vehiclePluginClient = new FakeVehiclePluginClientForHealth({}, {});
    const publisher = new FakePublisher();

    let handler: (payload: unknown) => Promise<void>;
    const fakeSubscriber = {
      subscribe: vi.fn(async (_subject: string, h: (payload: unknown) => Promise<void>) => {
        handler = h;
        return { unsubscribe: async () => {} };
      }),
    };
    await subscribeAssetHealthChanged(fakeSubscriber as any, assetRepo, {
      vehiclePluginClient: vehiclePluginClient as any,
      suggestionRepo,
      publisher: publisher as any,
    });

    await handler!({
      type: "AssetHealthChanged",
      org_id: "org-1",
      fleet_id: "fleet-1",
      timestamp: new Date().toISOString(),
      asset_id: asset.id,
      healthScore: 90,
      telemetry: { odometer_km: 15000 }, // still short of another +10000km from 12000
    });

    expect(publisher.published.find((p) => p.subject === "TaskSuggested")).toBeUndefined();
  });
});

describe("subscribeAssetHealthChanged — fuel efficiency", () => {
  it("computes mileage across a normal (non-refuel) delta", async () => {
    const assetRepo = new InMemoryAssetRepository();
    const asset = await assetRepo.create({ org_id: "org-1", fleet_id: "fleet-1", type: "vehicle", display_label: "TN-01" });
    await assetRepo.updateHealth(asset.id, 90, { fuel_pct: 80, odometer_km: 10000 });

    const vehiclePluginClient = new FakeVehiclePluginClientForHealth({}, { [asset.id]: { fuelCapacityLiters: 50 } });
    let handler: (payload: unknown) => Promise<void>;
    const fakeSubscriber = {
      subscribe: vi.fn(async (_subject: string, h: (payload: unknown) => Promise<void>) => {
        handler = h;
        return { unsubscribe: async () => {} };
      }),
    };
    await subscribeAssetHealthChanged(fakeSubscriber as any, assetRepo, {
      vehiclePluginClient: vehiclePluginClient as any,
      suggestionRepo: new InMemoryMaintenanceSuggestionRepository(),
      publisher: new FakePublisher() as any,
    });

    // 100km covered, fuel dropped from 80% to 70% of a 50L tank = 5L consumed -> 20 km/L
    await handler!({
      type: "AssetHealthChanged",
      org_id: "org-1",
      fleet_id: "fleet-1",
      timestamp: new Date().toISOString(),
      asset_id: asset.id,
      healthScore: 90,
      telemetry: { fuel_pct: 70, odometer_km: 10100 },
    });

    const updated = await assetRepo.get(asset.id, "org-1", "fleet-1");
    expect(updated?.last_mileage_kmpl).toBeCloseTo(20, 1);
  });

  it("skips the mileage calculation across a refuel (fuel_pct increased)", async () => {
    const assetRepo = new InMemoryAssetRepository();
    const asset = await assetRepo.create({ org_id: "org-1", fleet_id: "fleet-1", type: "vehicle", display_label: "TN-01" });
    await assetRepo.updateHealth(asset.id, 90, { fuel_pct: 10, odometer_km: 10000 });

    const vehiclePluginClient = new FakeVehiclePluginClientForHealth({}, { [asset.id]: { fuelCapacityLiters: 50 } });
    let handler: (payload: unknown) => Promise<void>;
    const fakeSubscriber = {
      subscribe: vi.fn(async (_subject: string, h: (payload: unknown) => Promise<void>) => {
        handler = h;
        return { unsubscribe: async () => {} };
      }),
    };
    await subscribeAssetHealthChanged(fakeSubscriber as any, assetRepo, {
      vehiclePluginClient: vehiclePluginClient as any,
      suggestionRepo: new InMemoryMaintenanceSuggestionRepository(),
      publisher: new FakePublisher() as any,
    });

    await handler!({
      type: "AssetHealthChanged",
      org_id: "org-1",
      fleet_id: "fleet-1",
      timestamp: new Date().toISOString(),
      asset_id: asset.id,
      healthScore: 90,
      telemetry: { fuel_pct: 90, odometer_km: 10050 }, // refueled
    });

    const updated = await assetRepo.get(asset.id, "org-1", "fleet-1");
    expect(updated?.last_mileage_kmpl).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @gamopls/fleet test -- health-subscription`
Expected: FAIL — `subscribeAssetHealthChanged` doesn't accept an options object yet, `InMemoryMaintenanceSuggestionRepository` doesn't exist, `Asset.last_mileage_kmpl` doesn't exist on the type.

- [ ] **Step 5: Extend `Asset` type and `AssetRepository`**

In `services/fleet/src/types.ts`, add `last_mileage_kmpl: z.number().nullable(),` to `assetSchema` (right after `telemetry_updated_at`).

In `services/fleet/src/asset-repository.ts`, extend the interface:

```typescript
export interface AssetRepository {
  create(input: CreateAssetInput): Promise<Asset>;
  get(id: string, org_id: string, fleet_id: string): Promise<Asset | null>;
  list(org_id: string, fleet_id: string): Promise<Asset[]>;
  delete(id: string): Promise<void>;
  updateHealth(id: string, health_score: number, telemetry: Record<string, unknown>): Promise<void>;
  updateMileage(id: string, last_mileage_kmpl: number | null): Promise<void>;
}
```

In `services/fleet/src/in-memory-asset-repository.ts`: add `last_mileage_kmpl: null,` to the object literal inside `create()`, and add:

```typescript
  async updateMileage(id: string, last_mileage_kmpl: number | null): Promise<void> {
    const asset = this.rows.find((a) => a.id === id);
    if (!asset) return;
    asset.last_mileage_kmpl = last_mileage_kmpl;
  }
```

In `services/fleet/src/prisma-asset-repository.ts`: add `last_mileage_kmpl: db.last_mileage_kmpl === null ? null : Number(db.last_mileage_kmpl),` to the `map()` method's returned object, and add:

```typescript
  async updateMileage(id: string, last_mileage_kmpl: number | null): Promise<void> {
    await this.prisma.asset.update({ where: { id }, data: { last_mileage_kmpl } });
  }
```

- [ ] **Step 6: Write the `MaintenanceSuggestion` repository**

Create `services/fleet/src/maintenance-suggestion-repository.ts`:

```typescript
export interface MaintenanceSuggestion {
  asset_id: string;
  service_type: string;
  suggested_at_odometer_km: number;
}

export interface MaintenanceSuggestionRepository {
  get(asset_id: string, service_type: string): Promise<MaintenanceSuggestion | null>;
  upsert(org_id: string, fleet_id: string, asset_id: string, service_type: string, suggested_at_odometer_km: number): Promise<void>;
}
```

Create `services/fleet/src/in-memory-maintenance-suggestion-repository.ts`:

```typescript
import type { MaintenanceSuggestion, MaintenanceSuggestionRepository } from "./maintenance-suggestion-repository.js";

export class InMemoryMaintenanceSuggestionRepository implements MaintenanceSuggestionRepository {
  private readonly rows = new Map<string, MaintenanceSuggestion>();

  private key(asset_id: string, service_type: string): string {
    return `${asset_id}:${service_type}`;
  }

  async get(asset_id: string, service_type: string): Promise<MaintenanceSuggestion | null> {
    return this.rows.get(this.key(asset_id, service_type)) ?? null;
  }

  async upsert(
    _org_id: string,
    _fleet_id: string,
    asset_id: string,
    service_type: string,
    suggested_at_odometer_km: number,
  ): Promise<void> {
    this.rows.set(this.key(asset_id, service_type), { asset_id, service_type, suggested_at_odometer_km });
  }
}
```

Create `services/fleet/src/prisma-maintenance-suggestion-repository.ts`:

```typescript
import type { PrismaClient } from "@gamopls/db";
import type { MaintenanceSuggestion, MaintenanceSuggestionRepository } from "./maintenance-suggestion-repository.js";

export class PrismaMaintenanceSuggestionRepository implements MaintenanceSuggestionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(asset_id: string, service_type: string): Promise<MaintenanceSuggestion | null> {
    const db = await this.prisma.maintenanceSuggestion.findUnique({
      where: { asset_id_service_type: { asset_id, service_type } },
    });
    return db ? { asset_id: db.asset_id, service_type: db.service_type, suggested_at_odometer_km: Number(db.suggested_at_odometer_km) } : null;
  }

  async upsert(
    org_id: string,
    fleet_id: string,
    asset_id: string,
    service_type: string,
    suggested_at_odometer_km: number,
  ): Promise<void> {
    await this.prisma.maintenanceSuggestion.upsert({
      where: { asset_id_service_type: { asset_id, service_type } },
      create: { org_id, fleet_id, asset_id, service_type, suggested_at_odometer_km },
      update: { suggested_at_odometer_km },
    });
  }
}
```

- [ ] **Step 7: Rewrite `health-subscription.ts` with the service-due check and mileage calc**

Replace the full contents of `services/fleet/src/health-subscription.ts`:

```typescript
import { ASSET_HEALTH_CHANGED, TASK_SUGGESTED, assetHealthChangedSchema, type EventPublisher, type EventSubscriber } from "@gamopls/event-schemas";
import type { AssetRepository } from "./asset-repository.js";
import type { MaintenanceSuggestionRepository } from "./maintenance-suggestion-repository.js";
import type { VehiclePluginClient } from "./vehicle-plugin-client.js";
import { SERVICE_INTERVALS_KM } from "./service-intervals.js";

export interface HealthSubscriptionDeps {
  vehiclePluginClient?: VehiclePluginClient;
  suggestionRepo?: MaintenanceSuggestionRepository;
  publisher?: EventPublisher;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

async function checkServiceDue(
  event: { org_id: string; fleet_id: string; asset_id: string; timestamp: string },
  odometerKm: number,
  deps: Required<Pick<HealthSubscriptionDeps, "vehiclePluginClient" | "suggestionRepo" | "publisher">>,
): Promise<void> {
  const records = await deps.vehiclePluginClient.getMaintenanceRecords(event.asset_id);

  for (const [serviceType, interval] of Object.entries(SERVICE_INTERVALS_KM)) {
    const lastServiceOdometer = records
      .filter((r) => r.serviceType === serviceType)
      .reduce((max, r) => Math.max(max, r.odometerAtServiceKm), 0);
    const dueAt = lastServiceOdometer + interval;
    if (odometerKm < dueAt) continue;

    const lastSuggestion = await deps.suggestionRepo.get(event.asset_id, serviceType);
    if (lastSuggestion && odometerKm < lastSuggestion.suggested_at_odometer_km + interval) continue;

    await deps.publisher.publish(TASK_SUGGESTED, {
      type: TASK_SUGGESTED,
      org_id: event.org_id,
      fleet_id: event.fleet_id,
      timestamp: event.timestamp,
      asset_id: event.asset_id,
      title: `${serviceType} due for asset ${event.asset_id}`,
      description: `Odometer at ${odometerKm}km has crossed the ${interval}km ${serviceType} interval (last service at ${lastServiceOdometer}km).`,
      source: "fleet.service-interval",
    });
    await deps.suggestionRepo.upsert(event.org_id, event.fleet_id, event.asset_id, serviceType, odometerKm);
  }
}

async function computeMileage(
  assetId: string,
  previousTelemetry: Record<string, unknown>,
  newTelemetry: Record<string, unknown>,
  vehiclePluginClient: VehiclePluginClient,
): Promise<number | null> {
  const oldFuel = numberOrNull(previousTelemetry.fuel_pct);
  const newFuel = numberOrNull(newTelemetry.fuel_pct);
  const oldOdo = numberOrNull(previousTelemetry.odometer_km);
  const newOdo = numberOrNull(newTelemetry.odometer_km);

  if (oldFuel === null || newFuel === null || oldOdo === null || newOdo === null) return null;
  if (newFuel > oldFuel) return null; // refuel — can't infer consumption across this delta
  if (newOdo <= oldOdo) return null;

  const vehicleDetails = await vehiclePluginClient.getVehicleDetails(assetId);
  if (!vehicleDetails || vehicleDetails.fuelCapacityLiters === null) return null;

  const distanceKm = newOdo - oldOdo;
  const fuelConsumedLiters = ((oldFuel - newFuel) / 100) * vehicleDetails.fuelCapacityLiters;
  if (fuelConsumedLiters <= 0) return null;

  return distanceKm / fuelConsumedLiters;
}

/**
 * Subscribes to AssetHealthChanged and persists the latest health score +
 * sensor telemetry snapshot onto the Asset row. Also (when the optional
 * deps are provided): checks whether any service interval has been
 * crossed by the new odometer reading and publishes TaskSuggested at most
 * once per crossing, and computes a rolling fuel-efficiency figure across
 * non-refuel deltas.
 */
export async function subscribeAssetHealthChanged(
  subscriber: EventSubscriber,
  assetRepo: AssetRepository,
  deps: HealthSubscriptionDeps = {},
) {
  return subscriber.subscribe<unknown>(ASSET_HEALTH_CHANGED, async (raw) => {
    const parsed = assetHealthChangedSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("fleet: dropped malformed AssetHealthChanged payload:", parsed.error.flatten());
      return;
    }
    const event = parsed.data;

    const existing = await assetRepo.get(event.asset_id, event.org_id, event.fleet_id);
    const previousTelemetry = existing?.telemetry ?? {};

    await assetRepo.updateHealth(event.asset_id, event.healthScore, event.telemetry);

    if (deps.vehiclePluginClient) {
      const mileage = await computeMileage(event.asset_id, previousTelemetry, event.telemetry, deps.vehiclePluginClient);
      if (mileage !== null) {
        await assetRepo.updateMileage(event.asset_id, mileage);
      }

      const odometerKm = numberOrNull(event.telemetry.odometer_km);
      if (odometerKm !== null && deps.suggestionRepo && deps.publisher) {
        await checkServiceDue(event, odometerKm, {
          vehiclePluginClient: deps.vehiclePluginClient,
          suggestionRepo: deps.suggestionRepo,
          publisher: deps.publisher,
        });
      }
    }
  });
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @gamopls/fleet test -- health-subscription`
Expected: PASS, all tests (existing 2 + 4 new).

- [ ] **Step 9: Proxy maintenance-record routes through `services/fleet`**

In `services/fleet/src/build-app.ts`, add before the final `return app;`:

```typescript
  app.post("/assets/:id/maintenance-records", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const asset = await assetRepo.get(id, tenancy.org_id, tenancy.fleet_id);
    if (!asset) return reply.status(404).send({ error: "asset not found" });

    const body = request.body as { serviceType?: string; performedAt?: string; odometerAtServiceKm?: number };
    if (!body.serviceType || !body.performedAt || typeof body.odometerAtServiceKm !== "number") {
      return reply.status(400).send({ error: "serviceType, performedAt, and odometerAtServiceKm are required" });
    }

    try {
      const record = await vehiclePluginClient.createMaintenanceRecord({
        assetId: id,
        serviceType: body.serviceType,
        performedAt: body.performedAt,
        odometerAtServiceKm: body.odometerAtServiceKm,
      });
      return reply.status(201).send(record);
    } catch (err) {
      if (err instanceof VehiclePluginClientError) {
        return reply.status(502).send({ error: "failed to create maintenance record", detail: err.message });
      }
      throw err;
    }
  });

  app.get("/assets/:id/maintenance-records", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const asset = await assetRepo.get(id, tenancy.org_id, tenancy.fleet_id);
    if (!asset) return reply.status(404).send({ error: "asset not found" });
    const records = await vehiclePluginClient.getMaintenanceRecords(id);
    return reply.status(200).send({ records });
  });
```

Add a test for both to `services/fleet/src/__tests__/build-app.test.ts` following the existing `FakeVehiclePluginClient` pattern already in that file (extend it with `createMaintenanceRecord`/`getMaintenanceRecords` methods backed by an in-memory array, matching the shape `plugins/asset-vehicle`'s Task 2 API returns).

- [ ] **Step 10: Wire the publisher and new deps into `server.ts`**

In `services/fleet/src/server.ts`, add imports:

```typescript
import { InMemoryMaintenanceSuggestionRepository } from "./in-memory-maintenance-suggestion-repository.js";
import { PrismaMaintenanceSuggestionRepository } from "./prisma-maintenance-suggestion-repository.js";
import type { MaintenanceSuggestionRepository } from "./maintenance-suggestion-repository.js";
```

Add the repo selection (mirroring the existing `assetRepo` branch):

```typescript
let suggestionRepo: MaintenanceSuggestionRepository;
if (databaseUrl) {
  suggestionRepo = new PrismaMaintenanceSuggestionRepository(getPrismaClient());
} else {
  suggestionRepo = new InMemoryMaintenanceSuggestionRepository();
}
```

Update the `subscribeAssetHealthChanged` call inside `main()`:

```typescript
    await subscribeAssetHealthChanged(bus, assetRepo, { vehiclePluginClient, suggestionRepo, publisher: bus });
```

(`bus` already implements both `EventSubscriber` and `EventPublisher` — no new connection needed.)

- [ ] **Step 11: Export new symbols and run full verification**

Append to `services/fleet/src/index.ts`:

```typescript
export type { MaintenanceSuggestionRepository, MaintenanceSuggestion } from "./maintenance-suggestion-repository.js";
export { InMemoryMaintenanceSuggestionRepository } from "./in-memory-maintenance-suggestion-repository.js";
export { PrismaMaintenanceSuggestionRepository } from "./prisma-maintenance-suggestion-repository.js";
export { SERVICE_INTERVALS_KM } from "./service-intervals.js";
```

Run: `pnpm --filter @gamopls/fleet test && pnpm --filter @gamopls/fleet exec tsc --noEmit -p .`
Expected: all PASS, no type errors.

- [ ] **Step 12: Commit**

```bash
git add services/fleet
git commit -m "feat(fleet): add service-due suggestions and fuel-efficiency calculation"
```

---

### Task 4: `services/ai-engine` — idle-time detection

**Files:**
- Modify: `services/ai-engine/src/ai_engine/events.py` (add `AssetLocationUpdated`, `AlertRaised` models)
- Create: `services/ai-engine/src/ai_engine/idle_detection.py`
- Modify: `services/ai-engine/src/ai_engine/server.py` (subscribe to the new event)
- Test: `services/ai-engine/tests/test_idle_detection.py`

**Interfaces:**
- Produces: `IdleDetector` class (`process_location_update(event) -> AlertRaised | None`, stateful per-asset), `AssetLocationUpdated`/`AlertRaised` Pydantic models mirroring the TS schemas. No other task depends on this — fully independent of Tasks 2-3.

- [ ] **Step 1: Add the two new event models**

Append to `services/ai-engine/src/ai_engine/events.py`:

```python
class AssetLocationUpdated(BaseEvent):
    """Mirrors `asset-location-updated.ts::assetLocationUpdatedSchema`."""

    type: Literal["AssetLocationUpdated"] = "AssetLocationUpdated"
    asset_id: str
    lat: float
    lng: float
    heading: float | None = None
    speed: float | None = None


class AlertRaised(BaseEvent):
    """Mirrors `alert-raised.ts::alertRaisedSchema`."""

    type: Literal["AlertRaised"] = "AlertRaised"
    asset_id: str
    severity: Literal["info", "warning", "critical"]
    reason: str
    message: str


ASSET_LOCATION_UPDATED_SUBJECT = "AssetLocationUpdated"
ALERT_RAISED_SUBJECT = "AlertRaised"
```

- [ ] **Step 2: Write the failing test**

Create `services/ai-engine/tests/test_idle_detection.py`:

```python
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ai_engine.events import AssetLocationUpdated
from ai_engine.idle_detection import IdleDetector


def _ts(minutes_from_epoch: int) -> str:
    base = datetime(2026, 7, 10, 0, 0, 0, tzinfo=timezone.utc)
    return (base + timedelta(minutes=minutes_from_epoch)).isoformat()


def _event(asset_id: str, minute: int, speed: float) -> AssetLocationUpdated:
    return AssetLocationUpdated(
        org_id="org-1",
        fleet_id="fleet-1",
        timestamp=_ts(minute),
        asset_id=asset_id,
        lat=13.08,
        lng=80.27,
        speed=speed,
    )


class TestIdleDetector:
    def test_no_alert_while_moving(self):
        detector = IdleDetector()
        assert detector.process_location_update(_event("v1", 0, 40)) is None
        assert detector.process_location_update(_event("v1", 5, 35)) is None

    def test_no_alert_before_duration_threshold(self):
        detector = IdleDetector()
        detector.process_location_update(_event("v1", 0, 40))
        assert detector.process_location_update(_event("v1", 10, 0)) is None  # only 10 min idle

    def test_alerts_once_after_sustained_idle(self):
        detector = IdleDetector()
        detector.process_location_update(_event("v1", 0, 40))
        detector.process_location_update(_event("v1", 5, 0))
        alert = detector.process_location_update(_event("v1", 26, 0))  # 21 min since last moving
        assert alert is not None
        assert alert.severity == "info"
        assert alert.reason == "prolonged_idle"
        assert "v1" in alert.message or "idle" in alert.message.lower()

        # Should not re-alert on the next tick while still idle.
        assert detector.process_location_update(_event("v1", 30, 0)) is None

    def test_new_episode_alerts_again_after_moving_then_idling(self):
        detector = IdleDetector()
        detector.process_location_update(_event("v1", 0, 40))
        detector.process_location_update(_event("v1", 5, 0))
        assert detector.process_location_update(_event("v1", 26, 0)) is not None  # first alert
        detector.process_location_update(_event("v1", 27, 40))  # moving again — new episode starts
        detector.process_location_update(_event("v1", 28, 0))
        second_alert = detector.process_location_update(_event("v1", 49, 0))  # 21 min idle again
        assert second_alert is not None

    def test_tracks_assets_independently(self):
        detector = IdleDetector()
        detector.process_location_update(_event("v1", 0, 0))
        alert = detector.process_location_update(_event("v2", 0, 40))
        assert alert is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd services/ai-engine && python -m pytest tests/test_idle_detection.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ai_engine.idle_detection'`.

- [ ] **Step 4: Write `idle_detection.py`**

Create `services/ai-engine/src/ai_engine/idle_detection.py`:

```python
"""Idle-time detection (Phase 8.D.3).

Publishes an AlertRaised (info severity) when an asset's speed stays near
zero for a sustained duration. Reuses the existing AlertRaised event type —
services/chat already turns these into system messages, services/map
already raises them for geofence exits, so no new consumer is needed.

Per CLAUDE.md, this only ever produces an event to publish — it never calls
another service directly.
"""

from __future__ import annotations

from datetime import datetime

from ai_engine.events import AlertRaised, AssetLocationUpdated

IDLE_SPEED_THRESHOLD_KMH = 3.0
IDLE_DURATION_THRESHOLD_MIN = 20.0


class _AssetIdleState:
    def __init__(self, last_moving_at: datetime) -> None:
        self.last_moving_at = last_moving_at
        self.alerted_for_current_episode = False


def _parse_ts(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


class IdleDetector:
    """Stateful, in-process per-asset idle tracker.

    Not persisted — a service restart resets idle episodes, which is an
    acceptable tradeoff for a V1 alerting nicety (the alert would simply
    re-fire after another full idle duration post-restart, not miss
    anything catastrophic).
    """

    def __init__(self) -> None:
        self._state: dict[str, _AssetIdleState] = {}

    def process_location_update(self, event: AssetLocationUpdated) -> AlertRaised | None:
        speed = event.speed if event.speed is not None else 0.0
        now = _parse_ts(event.timestamp)
        state = self._state.get(event.asset_id)

        if state is None:
            state = _AssetIdleState(last_moving_at=now)
            self._state[event.asset_id] = state

        if speed > IDLE_SPEED_THRESHOLD_KMH:
            state.last_moving_at = now
            state.alerted_for_current_episode = False
            return None

        idle_minutes = (now - state.last_moving_at).total_seconds() / 60.0
        if idle_minutes >= IDLE_DURATION_THRESHOLD_MIN and not state.alerted_for_current_episode:
            state.alerted_for_current_episode = True
            return AlertRaised(
                org_id=event.org_id,
                fleet_id=event.fleet_id,
                timestamp=event.timestamp,
                asset_id=event.asset_id,
                severity="info",
                reason="prolonged_idle",
                message=f"Vehicle {event.asset_id} idle for {int(idle_minutes)} min at ({event.lat}, {event.lng})",
            )

        return None
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd services/ai-engine && python -m pytest tests/test_idle_detection.py -v`
Expected: PASS, 5 tests.

- [ ] **Step 6: Wire the subscription into `server.py`**

In `services/ai-engine/src/ai_engine/server.py`, add imports:

```python
from ai_engine.events import AssetLocationUpdated, ASSET_LOCATION_UPDATED_SUBJECT, ALERT_RAISED_SUBJECT
from ai_engine.idle_detection import IdleDetector
```

Instantiate the detector before `async def main()`'s body ends (right after `publisher = NatsEventPublisher(nats_url)` / `await publisher.connect()`):

```python
    idle_detector = IdleDetector()

    async def location_handler(msg):
        try:
            payload = json.loads(msg.data.decode("utf-8"))
            event = AssetLocationUpdated(**payload)
            alert = idle_detector.process_location_update(event)
            if alert is not None:
                await publisher.publish_async(ALERT_RAISED_SUBJECT, alert.model_dump(mode="json"))
                print(f"ai-engine: published idle AlertRaised for asset {event.asset_id}", flush=True)
        except Exception as e:
            print(f"ai-engine error: failed to process AssetLocationUpdated: {e}", file=sys.stderr, flush=True)

    await nc.subscribe(ASSET_LOCATION_UPDATED_SUBJECT, cb=location_handler)
    print(f"ai-engine: subscribed to NATS subject '{ASSET_LOCATION_UPDATED_SUBJECT}'", flush=True)
```

- [ ] **Step 7: Run the full test suite**

Run: `cd services/ai-engine && python -m pytest -v`
Expected: all tests PASS (existing health-score/task-suggestion/agent-skeleton tests + 5 new idle-detection tests).

- [ ] **Step 8: Commit**

```bash
git add services/ai-engine
git commit -m "feat(ai-engine): add idle-time detection publishing AlertRaised"
```

---

### Task 5: `apps/web` — Maintenance card, log-service form, mileage display

**Files:**
- Modify: `apps/web/components/fleet/types.ts` (add `MaintenanceRecord`, `last_mileage_kmpl` on `Asset`)
- Modify: `apps/web/components/fleet/api.ts` (add `listMaintenanceRecords`, `logMaintenance`)
- Create: `apps/web/components/fleet/MaintenanceCard.tsx`
- Modify: `apps/web/app/fleet/vehicles/[id]/page.tsx` (mileage row + `<MaintenanceCard>`)
- Test: `apps/web/components/fleet/__tests__/MaintenanceCard.test.tsx`
- Test: `apps/web/app/fleet/vehicles/__tests__/page.test.tsx` (extend)

**Interfaces:**
- Consumes: `services/fleet`'s `GET/POST /api/fleet/assets/:id/maintenance-records` (Task 3's documented contract — same parallel-track pattern as before, code doesn't need to be merged first) and the `last_mileage_kmpl` field on `GET /api/fleet/assets/:id` (already returns the full `Asset` row, gains one new field per Task 3).

- [ ] **Step 1: Extend `types.ts`**

In `apps/web/components/fleet/types.ts`, add `last_mileage_kmpl: number | null;` to the `Asset` interface (after `telemetry_updated_at`), and add:

```typescript
export interface MaintenanceRecord {
  id: string;
  assetId: string;
  serviceType: "oil_change" | "brake_inspection" | "tire_rotation" | "general_service";
  performedAt: string;
  odometerAtServiceKm: number;
  createdAt: string;
}

export interface LogMaintenanceInput {
  serviceType: MaintenanceRecord["serviceType"];
  performedAt: string;
  odometerAtServiceKm: number;
}
```

- [ ] **Step 2: Add API client functions**

Append to `apps/web/components/fleet/api.ts`:

```typescript
export async function listMaintenanceRecords(assetId: string): Promise<MaintenanceRecord[]> {
  const res = await fetch(`/api/fleet/assets/${assetId}/maintenance-records`);
  const data = await parseOrThrow<{ records: MaintenanceRecord[] }>(res);
  return data.records;
}

export async function logMaintenance(assetId: string, input: LogMaintenanceInput): Promise<MaintenanceRecord> {
  const res = await fetch(`/api/fleet/assets/${assetId}/maintenance-records`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseOrThrow<MaintenanceRecord>(res);
}
```

Add `MaintenanceRecord`, `LogMaintenanceInput` to the `import type { ... } from "./types"` line at the top of the file.

- [ ] **Step 3: Write the failing test**

Create `apps/web/components/fleet/__tests__/MaintenanceCard.test.tsx`:

```typescript
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MaintenanceCard } from "../MaintenanceCard";
import * as fleetApi from "../api";

vi.mock("../api");
afterEach(() => cleanup());

describe("MaintenanceCard", () => {
  it("loads and lists past maintenance records", async () => {
    vi.mocked(fleetApi.listMaintenanceRecords).mockResolvedValue([
      { id: "rec-1", assetId: "asset-1", serviceType: "oil_change", performedAt: "2026-06-01T00:00:00.000Z", odometerAtServiceKm: 15000, createdAt: "2026-06-01T00:00:00.000Z" },
    ]);

    render(<MaintenanceCard assetId="asset-1" currentOdometerKm={16000} />);

    await waitFor(() => expect(screen.getByText(/oil_change/)).toBeInTheDocument());
    expect(screen.getByText(/15,000 km/)).toBeInTheDocument();
  });

  it("submits a new maintenance record defaulting odometer to the current reading", async () => {
    vi.mocked(fleetApi.listMaintenanceRecords).mockResolvedValue([]);
    vi.mocked(fleetApi.logMaintenance).mockResolvedValue({} as any);

    render(<MaintenanceCard assetId="asset-1" currentOdometerKm={16000} />);
    await waitFor(() => expect(fleetApi.listMaintenanceRecords).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /log maintenance/i }));

    await waitFor(() =>
      expect(fleetApi.logMaintenance).toHaveBeenCalledWith(
        "asset-1",
        expect.objectContaining({ serviceType: "oil_change", odometerAtServiceKm: 16000 }),
      ),
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/web && npx vitest run components/fleet/__tests__/MaintenanceCard.test.tsx`
Expected: FAIL — `Cannot find module '../MaintenanceCard'`.

- [ ] **Step 5: Write `MaintenanceCard.tsx`**

Create `apps/web/components/fleet/MaintenanceCard.tsx`:

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Spinner } from "@gamopls/ui";
import * as fleetApi from "./api";
import type { MaintenanceRecord } from "./types";

const SERVICE_TYPES: MaintenanceRecord["serviceType"][] = ["oil_change", "brake_inspection", "tire_rotation", "general_service"];

export interface MaintenanceCardProps {
  assetId: string;
  currentOdometerKm: number;
}

export function MaintenanceCard({ assetId, currentOdometerKm }: MaintenanceCardProps) {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceType, setServiceType] = useState<MaintenanceRecord["serviceType"]>("oil_change");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await fleetApi.listMaintenanceRecords(assetId));
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleLog() {
    setSubmitting(true);
    try {
      await fleetApi.logMaintenance(assetId, {
        serviceType,
        performedAt: new Date().toISOString(),
        odometerAtServiceKm: currentOdometerKm,
      });
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border border-border bg-card p-6 space-y-4">
      <h2 className="text-lg font-bold text-white">Maintenance</h2>

      <div className="flex items-center gap-2">
        <select
          aria-label="Service type"
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value as MaintenanceRecord["serviceType"])}
          className="h-8 px-2 rounded-md bg-background/50 border border-border text-xs text-foreground"
        >
          {SERVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Button type="button" disabled={submitting} onClick={() => void handleLog()} style={{ padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}>
          {submitting ? "Logging…" : "Log maintenance"}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner size={20} label="Loading maintenance history" />
        </div>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
          No maintenance logged yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {records.map((r) => (
            <li key={r.id} className="text-sm text-muted-foreground">
              {r.serviceType} — {r.odometerAtServiceKm.toLocaleString()} km ({new Date(r.performedAt).toLocaleDateString()})
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/web && npx vitest run components/fleet/__tests__/MaintenanceCard.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 7: Wire into the vehicle detail page**

In `apps/web/app/fleet/vehicles/[id]/page.tsx`, add the import:

```typescript
import { MaintenanceCard } from "@/components/fleet/MaintenanceCard";
```

Add a mileage line inside the existing telemetry-summary block (the `<div className="flex items-center gap-3">` containing the fuel line), right after the fuel `<span>`:

```typescript
          {typeof asset.last_mileage_kmpl === "number" && (
            <span className="text-sm text-muted-foreground">Mileage: {asset.last_mileage_kmpl.toFixed(1)} km/L</span>
          )}
```

Add `<MaintenanceCard assetId={asset.id} currentOdometerKm={asset.vehicleDetails?.odometerKm ?? 0} />` as a new sibling `Card` at the end of the page's returned JSX, after the existing "Driver assignment" `Card`.

- [ ] **Step 8: Extend the page test**

In `apps/web/app/fleet/vehicles/__tests__/page.test.tsx`, add `last_mileage_kmpl: 18.5,` to the mocked `getVehicle` response, mock `fleetApi.listMaintenanceRecords` to resolve `[]` (add to the existing `vi.mock("@/components/fleet/api")` setup), and add an assertion:

```typescript
    expect(screen.getByText(/18.5 km\/L/)).toBeInTheDocument();
```

- [ ] **Step 9: Run the full `apps/web` test suite**

Run: `cd apps/web && npx vitest run`
Expected: all tests PASS, no regressions.

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/fleet apps/web/app/fleet/vehicles
git commit -m "feat(web): show mileage and maintenance history on the vehicle detail page"
```

---

## Post-plan verification

```bash
pnpm build && pnpm lint && pnpm test
cd services/ai-engine && python -m pytest -v
```

Then smoke-test manually: run the Edge Box simulator with an odometer that crosses 10,000km for a vehicle with no maintenance history, confirm a draft task appears in Board titled "oil_change due for asset ...". Log a maintenance record from the vehicle detail page and confirm the mileage/maintenance list updates.
