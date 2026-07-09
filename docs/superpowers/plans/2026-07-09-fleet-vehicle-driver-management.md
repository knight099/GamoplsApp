# Fleet, Vehicle & Driver Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a fleet operator create fleets, add vehicles and drivers, assign drivers to vehicles (with history), and see each vehicle's live health/telemetry snapshot sourced from the existing Edge Box ingestion pipeline.

**Architecture:** A new `services/fleet` (Fastify + Zod + Prisma, matching `services/board`'s shape exactly) owns `Fleet`, `Driver`, `Asset` (base registry), and `DriverAssignment` (history). `plugins/asset-vehicle` gains its own small Fastify HTTP API so `services/fleet` reaches vehicle-specific fields (`VehicleDetails`) over the network, never via a direct import. `apps/web` gets a new gateway route, a fleet-switch endpoint, and two new list+form views (Vehicles, Drivers) plus a fleet switcher in the sidebar.

**Tech Stack:** Fastify 5, Zod 3, Prisma 6 (`@gamopls/db`), `@gamopls/event-bus-nats`/`@gamopls/event-schemas` (DIP ports), Next.js 15 route handlers, `@gamopls/auth` (JWT), existing `@gamopls/ui` primitives + Tailwind.

## Global Constraints

- Every repository method takes `org_id`/`fleet_id` explicitly (defense-in-depth; primary enforcement is the API gateway per `CLAUDE.md`).
- `services/fleet` must never `import` from `plugins/asset-vehicle` — only reach it over HTTP.
- `apps/web` must never call `services/fleet` or `plugins/asset-vehicle` directly — only through `/api/fleet/...` (`lib/gateway-proxy.ts`).
- No new frontend form library — plain `useState` + controlled inputs, matching `components/board/MissionForm.tsx`.
- Every new Fastify app is tested via `.inject()`, no real port binding in tests, matching `services/board/src/__tests__/build-app.test.ts`.

---

### Task 1: Prisma schema — Fleet, Driver, Asset, DriverAssignment, VehicleDetails extension

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma models `Fleet`, `Driver`, `Asset`, `DriverAssignment`, and three new nullable string columns (`color`, `year`, `vin`) on the existing `VehicleDetails` model. All later tasks import the generated `PrismaClient` types for these.

- [ ] **Step 1: Append the new models to the schema**

Add this block to `packages/db/prisma/schema.prisma`, right before the closing `// plugins/asset-vehicle` section's `VehicleDetails` model (so it reads top-to-bottom by owning service):

```prisma
// ---------------------------------------------------------------------------
// services/fleet — Fleets, Drivers, base Asset registry, assignment history
// ---------------------------------------------------------------------------

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
  status         String   @default("active")
  created_at     DateTime @default(now()) @db.Timestamptz()
  updated_at     DateTime @default(now()) @updatedAt @db.Timestamptz()

  assignments DriverAssignment[]

  @@index([org_id, fleet_id])
  @@map("drivers")
}

model Asset {
  id                   String    @id @db.Uuid
  org_id               String
  fleet_id             String
  type                 String
  display_label        String
  health_score         Int       @default(100)
  telemetry            Json      @default("{}")
  telemetry_updated_at DateTime? @db.Timestamptz()
  created_at           DateTime  @default(now()) @db.Timestamptz()
  updated_at           DateTime  @default(now()) @updatedAt @db.Timestamptz()

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

- [ ] **Step 2: Extend `VehicleDetails` with color/year/vin**

In the existing `model VehicleDetails { ... }` block, add these three lines directly under `model String?`:

```prisma
  color                String?
  year                 String?
  vin                  String?
```

- [ ] **Step 3: Generate a migration**

Run: `pnpm --filter @gamopls/db db:migrate -- --name add_fleet_driver_asset_assignment`
Expected: prompts for a migration name (or uses the passed `--name`), creates a new folder under `packages/db/prisma/migrations/`, applies it to the local dev database, and regenerates the Prisma client. Confirm the output ends with `Your database is now in sync with your schema.`

- [ ] **Step 4: Verify the client exports the new types**

Run: `pnpm --filter @gamopls/db build`
Expected: exits 0. Then run `grep -c "model Fleet" packages/db/node_modules/.prisma/client/index.d.ts` (or equivalent generated output path) — expect a non-zero count confirming `Fleet` is in the generated types. If the grep path doesn't exist, instead run `node -e "const {PrismaClient} = require('@gamopls/db'); console.log(typeof new PrismaClient().fleet)"` from `packages/db` — expect `object`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma
git commit -m "feat(db): add Fleet, Driver, Asset, DriverAssignment models; extend VehicleDetails"
```

---

### Task 2: `plugins/asset-vehicle` — VehicleDetails repository (in-memory + Prisma)

**Files:**
- Create: `plugins/asset-vehicle/src/vehicle-details-repository.ts`
- Create: `plugins/asset-vehicle/src/in-memory-vehicle-details-repository.ts`
- Create: `plugins/asset-vehicle/src/prisma-vehicle-details-repository.ts`
- Create: `plugins/asset-vehicle/src/schemas.ts`
- Modify: `plugins/asset-vehicle/src/vehicle-details.ts:22-39` (add `color`, `year`, `vin` fields)
- Modify: `plugins/asset-vehicle/package.json` (add `@gamopls/db`, `zod` deps)
- Modify: `plugins/asset-vehicle/src/index.ts` (export new symbols)
- Test: `plugins/asset-vehicle/src/__tests__/in-memory-vehicle-details-repository.test.ts`

**Interfaces:**
- Consumes: `VehicleDetails`, `FuelType`, `TripLeg` from `./vehicle-details.js` (existing); `PrismaClient` from `@gamopls/db`.
- Produces: `VehicleDetailsRepository` interface with `create(input: CreateVehicleDetailsInput): Promise<VehicleDetails>`, `get(assetId: string): Promise<VehicleDetails | null>`, `update(assetId: string, patch: UpdateVehicleDetailsInput): Promise<VehicleDetails | null>`. `InMemoryVehicleDetailsRepository` and `PrismaVehicleDetailsRepository` both implement it. `createVehicleDetailsInputSchema`/`updateVehicleDetailsInputSchema` (Zod) from `./schemas.js`.

- [ ] **Step 1: Add the three new fields to `VehicleDetails`**

In `plugins/asset-vehicle/src/vehicle-details.ts`, inside the `VehicleDetails` interface, add after `model: string | null;`:

```typescript
  color: string | null;
  year: string | null;
  vin: string | null;
```

- [ ] **Step 2: Write Zod input schemas**

Create `plugins/asset-vehicle/src/schemas.ts`:

```typescript
import { z } from "zod";

export const fuelTypeSchema = z.enum(["petrol", "diesel", "electric", "hybrid", "cng"]);
export const vehicleTypeSchema = z.enum(["truck", "van", "car", "bike", "bus", "other"]);

export const createVehicleDetailsInputSchema = z.object({
  assetId: z.string().min(1),
  plateNumber: z.string().min(1),
  vehicleType: vehicleTypeSchema,
  fuelType: fuelTypeSchema,
  make: z.string().min(1).nullable().default(null),
  model: z.string().min(1).nullable().default(null),
  color: z.string().min(1).nullable().default(null),
  year: z.string().min(1).nullable().default(null),
  vin: z.string().min(1).nullable().default(null),
  fuelCapacityLiters: z.number().positive().nullable().default(null),
  odometerKm: z.number().min(0).default(0),
});
export type CreateVehicleDetailsInput = z.infer<typeof createVehicleDetailsInputSchema>;

export const updateVehicleDetailsInputSchema = z.object({
  odometerKm: z.number().min(0).optional(),
  color: z.string().min(1).nullable().optional(),
  year: z.string().min(1).nullable().optional(),
  vin: z.string().min(1).nullable().optional(),
  make: z.string().min(1).nullable().optional(),
  model: z.string().min(1).nullable().optional(),
});
export type UpdateVehicleDetailsInput = z.infer<typeof updateVehicleDetailsInputSchema>;
```

- [ ] **Step 2b: Run a sanity check that the schema module compiles**

Run: `pnpm --filter @gamopls/asset-vehicle exec tsc --noEmit -p .`
Expected: no errors mentioning `schemas.ts`. (Errors about missing repository files below are expected at this point — ignore those, they're resolved in later steps of this task.)

- [ ] **Step 3: Write the repository port**

Create `plugins/asset-vehicle/src/vehicle-details-repository.ts`:

```typescript
import type { VehicleDetails } from "./vehicle-details.js";
import type { CreateVehicleDetailsInput, UpdateVehicleDetailsInput } from "./schemas.js";

/**
 * Persistence port for VehicleDetails — owned entirely by this plugin
 * (CLAUDE.md: never joined into or duplicated in services/board's tables).
 * services/fleet reaches this only through the HTTP API in build-app.ts,
 * never by importing this interface or its implementations directly.
 */
export interface VehicleDetailsRepository {
  create(input: CreateVehicleDetailsInput): Promise<VehicleDetails>;
  get(assetId: string): Promise<VehicleDetails | null>;
  update(assetId: string, patch: UpdateVehicleDetailsInput): Promise<VehicleDetails | null>;
}
```

- [ ] **Step 4: Write the in-memory implementation**

Create `plugins/asset-vehicle/src/in-memory-vehicle-details-repository.ts`:

```typescript
import type { VehicleDetails } from "./vehicle-details.js";
import type { VehicleDetailsRepository } from "./vehicle-details-repository.js";
import type { CreateVehicleDetailsInput, UpdateVehicleDetailsInput } from "./schemas.js";

export class InMemoryVehicleDetailsRepository implements VehicleDetailsRepository {
  private readonly store = new Map<string, VehicleDetails>();

  async create(input: CreateVehicleDetailsInput): Promise<VehicleDetails> {
    const now = new Date().toISOString();
    const record: VehicleDetails = {
      assetId: input.assetId,
      plateNumber: input.plateNumber,
      vehicleType: input.vehicleType,
      make: input.make,
      model: input.model,
      color: input.color,
      year: input.year,
      vin: input.vin,
      fuelType: input.fuelType,
      fuelCapacityLiters: input.fuelCapacityLiters,
      odometerKm: input.odometerKm,
      currentTrip: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(input.assetId, record);
    return record;
  }

  async get(assetId: string): Promise<VehicleDetails | null> {
    return this.store.get(assetId) ?? null;
  }

  async update(assetId: string, patch: UpdateVehicleDetailsInput): Promise<VehicleDetails | null> {
    const existing = this.store.get(assetId);
    if (!existing) return null;
    const updated: VehicleDetails = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(assetId, updated);
    return updated;
  }
}
```

- [ ] **Step 5: Write the failing test**

Create `plugins/asset-vehicle/src/__tests__/in-memory-vehicle-details-repository.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { InMemoryVehicleDetailsRepository } from "../in-memory-vehicle-details-repository.js";

describe("InMemoryVehicleDetailsRepository", () => {
  it("creates, gets, and updates a vehicle details record", async () => {
    const repo = new InMemoryVehicleDetailsRepository();

    const created = await repo.create({
      assetId: "asset-1",
      plateNumber: "TN-09-AB-1234",
      vehicleType: "truck",
      fuelType: "diesel",
      make: null,
      model: null,
      color: null,
      year: null,
      vin: null,
      fuelCapacityLiters: null,
      odometerKm: 0,
    });
    expect(created.plateNumber).toBe("TN-09-AB-1234");

    const fetched = await repo.get("asset-1");
    expect(fetched?.plateNumber).toBe("TN-09-AB-1234");

    const updated = await repo.update("asset-1", { odometerKm: 1500 });
    expect(updated?.odometerKm).toBe(1500);

    expect(await repo.get("nonexistent")).toBeNull();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @gamopls/asset-vehicle test -- in-memory-vehicle-details-repository`
Expected: FAIL (module `in-memory-vehicle-details-repository.js` compiled output not found / import error) — this is expected since step 4 hasn't been picked up by a build yet in a fresh run; if using `vitest` directly against `.ts` sources it should actually PASS immediately since step 4 already created the file. If it fails for any reason other than a genuine assertion mismatch, fix the implementation, not the test.

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @gamopls/asset-vehicle test -- in-memory-vehicle-details-repository`
Expected: PASS, 1 test.

- [ ] **Step 8: Write the Prisma implementation**

Add `"@gamopls/db": "workspace:*"` and `"zod": "^3.23.8"` to `plugins/asset-vehicle/package.json`'s `dependencies`.

Create `plugins/asset-vehicle/src/prisma-vehicle-details-repository.ts`:

```typescript
import type { PrismaClient } from "@gamopls/db";
import type { VehicleDetails } from "./vehicle-details.js";
import type { VehicleDetailsRepository } from "./vehicle-details-repository.js";
import type { CreateVehicleDetailsInput, UpdateVehicleDetailsInput } from "./schemas.js";

export class PrismaVehicleDetailsRepository implements VehicleDetailsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(db: any): VehicleDetails {
    return {
      assetId: db.asset_id,
      plateNumber: db.plate_number,
      vehicleType: db.vehicle_type,
      make: db.make,
      model: db.model,
      color: db.color,
      year: db.year,
      vin: db.vin,
      fuelType: db.fuel_type,
      fuelCapacityLiters: db.fuel_capacity_liters === null ? null : Number(db.fuel_capacity_liters),
      odometerKm: Number(db.odometer_km),
      currentTrip:
        db.trip_started_at === null
          ? null
          : {
              startedAt: db.trip_started_at.toISOString(),
              endedAt: db.trip_ended_at ? db.trip_ended_at.toISOString() : null,
              originLabel: db.trip_origin_label ?? "",
              destinationLabel: db.trip_destination_label ?? "",
              distanceKm: db.trip_distance_km === null ? null : Number(db.trip_distance_km),
            },
      createdAt: db.created_at.toISOString(),
      updatedAt: db.updated_at.toISOString(),
    };
  }

  async create(input: CreateVehicleDetailsInput): Promise<VehicleDetails> {
    const db = await this.prisma.vehicleDetails.create({
      data: {
        asset_id: input.assetId,
        plate_number: input.plateNumber,
        vehicle_type: input.vehicleType,
        fuel_type: input.fuelType,
        make: input.make,
        model: input.model,
        color: input.color,
        year: input.year,
        vin: input.vin,
        fuel_capacity_liters: input.fuelCapacityLiters,
        odometer_km: input.odometerKm,
      },
    });
    return this.map(db);
  }

  async get(assetId: string): Promise<VehicleDetails | null> {
    const db = await this.prisma.vehicleDetails.findUnique({ where: { asset_id: assetId } });
    return db ? this.map(db) : null;
  }

  async update(assetId: string, patch: UpdateVehicleDetailsInput): Promise<VehicleDetails | null> {
    try {
      const db = await this.prisma.vehicleDetails.update({
        where: { asset_id: assetId },
        data: {
          ...(patch.odometerKm !== undefined ? { odometer_km: patch.odometerKm } : {}),
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...(patch.year !== undefined ? { year: patch.year } : {}),
          ...(patch.vin !== undefined ? { vin: patch.vin } : {}),
          ...(patch.make !== undefined ? { make: patch.make } : {}),
          ...(patch.model !== undefined ? { model: patch.model } : {}),
        },
      });
      return this.map(db);
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 9: Export the new symbols**

In `plugins/asset-vehicle/src/index.ts`, add:

```typescript
export type { VehicleDetailsRepository } from "./vehicle-details-repository.js";
export { InMemoryVehicleDetailsRepository } from "./in-memory-vehicle-details-repository.js";
export { PrismaVehicleDetailsRepository } from "./prisma-vehicle-details-repository.js";
export {
  createVehicleDetailsInputSchema,
  updateVehicleDetailsInputSchema,
  fuelTypeSchema,
  vehicleTypeSchema,
} from "./schemas.js";
export type { CreateVehicleDetailsInput, UpdateVehicleDetailsInput } from "./schemas.js";
```

- [ ] **Step 10: Run full package test suite and typecheck**

Run: `pnpm --filter @gamopls/asset-vehicle test && pnpm --filter @gamopls/asset-vehicle exec tsc --noEmit -p .`
Expected: all tests PASS, no type errors.

- [ ] **Step 11: Commit**

```bash
git add plugins/asset-vehicle
git commit -m "feat(asset-vehicle): add VehicleDetails repository (in-memory + Prisma) and color/year/vin fields"
```

---

### Task 3: `plugins/asset-vehicle` — HTTP API

**Files:**
- Create: `plugins/asset-vehicle/src/build-app.ts`
- Create: `plugins/asset-vehicle/src/server.ts`
- Modify: `plugins/asset-vehicle/package.json` (add `fastify` dep + `dev`/`start` scripts, add `src/server.ts` to the `build` tsup entry list)
- Test: `plugins/asset-vehicle/src/__tests__/build-app.test.ts`

**Interfaces:**
- Consumes: `VehicleDetailsRepository`, `InMemoryVehicleDetailsRepository` (Task 2), `createVehicleDetailsInputSchema`, `updateVehicleDetailsInputSchema` (Task 2).
- Produces: `buildApp(options?: { repo?: VehicleDetailsRepository }): FastifyInstance` with routes `GET /health`, `POST /vehicle-details`, `GET /vehicle-details/:assetId`, `PATCH /vehicle-details/:assetId`. `services/fleet` (Task 6) calls this HTTP contract.

- [ ] **Step 1: Add `fastify` dependency**

Add `"fastify": "^5.1.0"` to `plugins/asset-vehicle/package.json`'s `dependencies`.

- [ ] **Step 2: Write the failing test**

Create `plugins/asset-vehicle/src/__tests__/build-app.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../build-app.js";
import { InMemoryVehicleDetailsRepository } from "../in-memory-vehicle-details-repository.js";

describe("asset-vehicle app — VehicleDetails REST API", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({ repo: new InMemoryVehicleDetailsRepository() });
  });

  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("creates then fetches vehicle details", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/vehicle-details",
      payload: {
        assetId: "asset-1",
        plateNumber: "TN-09-AB-1234",
        vehicleType: "van",
        fuelType: "petrol",
      },
    });
    expect(createRes.statusCode).toBe(201);
    expect(createRes.json().plateNumber).toBe("TN-09-AB-1234");

    const getRes = await app.inject({ method: "GET", url: "/vehicle-details/asset-1" });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().vehicleType).toBe("van");
  });

  it("returns 404 for an unknown assetId", async () => {
    const res = await app.inject({ method: "GET", url: "/vehicle-details/nonexistent" });
    expect(res.statusCode).toBe(404);
  });

  it("rejects an invalid create payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/vehicle-details",
      payload: { assetId: "asset-1" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("updates odometer via PATCH", async () => {
    await app.inject({
      method: "POST",
      url: "/vehicle-details",
      payload: { assetId: "asset-2", plateNumber: "TN-01-XY-0001", vehicleType: "car", fuelType: "electric" },
    });
    const patchRes = await app.inject({
      method: "PATCH",
      url: "/vehicle-details/asset-2",
      payload: { odometerKm: 4200 },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().odometerKm).toBe(4200);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @gamopls/asset-vehicle test -- build-app`
Expected: FAIL — `Cannot find module '../build-app.js'`.

- [ ] **Step 4: Write `build-app.ts`**

Create `plugins/asset-vehicle/src/build-app.ts`:

```typescript
import Fastify, { type FastifyInstance } from "fastify";
import { InMemoryVehicleDetailsRepository } from "./in-memory-vehicle-details-repository.js";
import type { VehicleDetailsRepository } from "./vehicle-details-repository.js";
import { createVehicleDetailsInputSchema, updateVehicleDetailsInputSchema } from "./schemas.js";

export interface BuildAppOptions {
  repo?: VehicleDetailsRepository;
}

/**
 * Builds (but does not start listening) the Fastify app for this plugin's
 * VehicleDetails HTTP API. services/fleet is the only intended caller —
 * this is not exposed through apps/web's gateway (CLAUDE.md: plugins are
 * separate deployable services, reached over the network by module
 * services, never imported directly).
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const repo = options.repo ?? new InMemoryVehicleDetailsRepository();

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/vehicle-details", async (request, reply) => {
    const parsed = createVehicleDetailsInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid payload", details: parsed.error.flatten() });
    }
    const record = await repo.create(parsed.data);
    return reply.status(201).send(record);
  });

  app.get("/vehicle-details/:assetId", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const record = await repo.get(assetId);
    if (!record) return reply.status(404).send({ error: "not found" });
    return reply.status(200).send(record);
  });

  app.patch("/vehicle-details/:assetId", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const parsed = updateVehicleDetailsInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid payload", details: parsed.error.flatten() });
    }
    const record = await repo.update(assetId, parsed.data);
    if (!record) return reply.status(404).send({ error: "not found" });
    return reply.status(200).send(record);
  });

  return app;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @gamopls/asset-vehicle test -- build-app`
Expected: PASS, 5 tests.

- [ ] **Step 6: Write `server.ts`**

Create `plugins/asset-vehicle/src/server.ts`:

```typescript
import { buildApp } from "./build-app.js";
import { InMemoryVehicleDetailsRepository } from "./in-memory-vehicle-details-repository.js";
import { PrismaVehicleDetailsRepository } from "./prisma-vehicle-details-repository.js";
import { getPrismaClient } from "@gamopls/db";
import type { VehicleDetailsRepository } from "./vehicle-details-repository.js";

const port = Number(process.env.PORT ?? 4700);
const host = process.env.HOST ?? "0.0.0.0";
const databaseUrl = process.env.DATABASE_URL;

let repo: VehicleDetailsRepository;
if (databaseUrl) {
  console.log("asset-vehicle: using Neon Postgres database via Prisma");
  repo = new PrismaVehicleDetailsRepository(getPrismaClient());
} else {
  console.warn("asset-vehicle: DATABASE_URL not set — running with an in-memory (non-persistent) store.");
  repo = new InMemoryVehicleDetailsRepository();
}

const app = buildApp({ repo });

app
  .listen({ port, host })
  .then(() => {
    app.log.info(`asset-vehicle listening on http://${host}:${port}`);
  })
  .catch((err) => {
    console.error("asset-vehicle failed to start:", err);
    process.exit(1);
  });
```

- [ ] **Step 7: Wire up build/dev/start scripts**

In `plugins/asset-vehicle/package.json`, change the `build` script and add `dev`/`start`:

```json
"build": "tsup src/index.ts src/server.ts --format esm --dts --clean",
"dev": "tsx watch src/server.ts",
"start": "node dist/server.js",
```

Add `"tsx": "^4.19.2"` to `devDependencies` if not already present (check — `services/board` has it).

- [ ] **Step 8: Run full package test suite**

Run: `pnpm --filter @gamopls/asset-vehicle test`
Expected: all tests PASS (registration-client, vehicle, in-memory-vehicle-details-repository, build-app).

- [ ] **Step 9: Commit**

```bash
git add plugins/asset-vehicle
git commit -m "feat(asset-vehicle): add HTTP API (POST/GET/PATCH vehicle-details) and server entrypoint"
```

---

### Task 4: `services/fleet` — scaffold + Fleet CRUD

**Files:**
- Create: `services/fleet/package.json`
- Create: `services/fleet/tsconfig.json`
- Create: `services/fleet/src/types.ts`
- Create: `services/fleet/src/fleet-repository.ts`
- Create: `services/fleet/src/in-memory-fleet-repository.ts`
- Create: `services/fleet/src/prisma-fleet-repository.ts`
- Create: `services/fleet/src/build-app.ts`
- Create: `services/fleet/src/index.ts`
- Test: `services/fleet/src/__tests__/build-app.test.ts`

**Interfaces:**
- Produces: `FleetRepository` (`create`, `list`), `buildApp(options?: { fleetRepo?: FleetRepository }): FastifyInstance` with `GET /health`, `POST /fleets`, `GET /fleets`. Later tasks (5-8) extend the same `buildApp`.

- [ ] **Step 1: Look at `services/board/tsconfig.json` and copy its shape**

Run: `cat services/board/tsconfig.json`
Expected output is a small file extending `@gamopls/config`'s base tsconfig — copy it verbatim into `services/fleet/tsconfig.json`, no changes needed (it's project-agnostic).

- [ ] **Step 2: Create `package.json`**

Create `services/fleet/package.json`:

```json
{
  "name": "@gamopls/fleet",
  "version": "0.0.0",
  "private": true,
  "description": "services/fleet — Fleet/Driver/Asset registry and driver-assignment history. Asset-type-agnostic: reaches plugins/asset-vehicle only over HTTP, never by import.",
  "license": "UNLICENSED",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts src/server.ts --format esm --dts --clean",
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "lint": "eslint . --config ../../packages/config/eslint.config.mjs",
    "test": "vitest run"
  },
  "dependencies": {
    "@gamopls/asset-contracts": "workspace:*",
    "@gamopls/db": "workspace:*",
    "@gamopls/event-bus-nats": "workspace:*",
    "@gamopls/event-schemas": "workspace:*",
    "fastify": "^5.1.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@gamopls/config": "workspace:*",
    "@types/node": "^20.14.0",
    "eslint": "^9.15.0",
    "tsup": "^8.3.5",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 3: Write `types.ts` (Fleet schema)**

Create `services/fleet/src/types.ts`:

```typescript
import { z } from "zod";

export const fleetSchema = z.object({
  id: z.string().min(1),
  org_id: z.string().min(1),
  name: z.string().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Fleet = z.infer<typeof fleetSchema>;

export const createFleetInputSchema = z.object({
  org_id: z.string().min(1),
  name: z.string().min(1),
});
export type CreateFleetInput = z.infer<typeof createFleetInputSchema>;
```

- [ ] **Step 4: Write the repository port + in-memory implementation**

Create `services/fleet/src/fleet-repository.ts`:

```typescript
import type { CreateFleetInput, Fleet } from "./types.js";

export interface FleetRepository {
  create(input: CreateFleetInput): Promise<Fleet>;
  list(org_id: string): Promise<Fleet[]>;
}
```

Create `services/fleet/src/in-memory-fleet-repository.ts`:

```typescript
import { randomUUID } from "node:crypto";
import type { FleetRepository } from "./fleet-repository.js";
import type { CreateFleetInput, Fleet } from "./types.js";

export class InMemoryFleetRepository implements FleetRepository {
  private readonly rows: Fleet[] = [];

  async create(input: CreateFleetInput): Promise<Fleet> {
    const now = new Date().toISOString();
    const fleet: Fleet = { id: randomUUID(), org_id: input.org_id, name: input.name, created_at: now, updated_at: now };
    this.rows.push(fleet);
    return fleet;
  }

  async list(org_id: string): Promise<Fleet[]> {
    return this.rows.filter((f) => f.org_id === org_id);
  }
}
```

- [ ] **Step 5: Write the failing test**

Create `services/fleet/src/__tests__/build-app.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../build-app.js";
import { InMemoryFleetRepository } from "../in-memory-fleet-repository.js";

describe("fleet app — Fleet REST API", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({ fleetRepo: new InMemoryFleetRepository() });
  });

  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("creates then lists fleets, tenant-scoped by org_id", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/fleets",
      payload: { org_id: "org-1", name: "Chennai Pilot Fleet" },
    });
    expect(createRes.statusCode).toBe(201);

    const listRes = await app.inject({ method: "GET", url: "/fleets?org_id=org-1" });
    expect(listRes.json().fleets).toHaveLength(1);

    const otherOrgRes = await app.inject({ method: "GET", url: "/fleets?org_id=org-2" });
    expect(otherOrgRes.json().fleets).toHaveLength(0);
  });

  it("rejects fleet creation with an empty name", async () => {
    const res = await app.inject({ method: "POST", url: "/fleets", payload: { org_id: "org-1", name: "" } });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @gamopls/fleet test`
Expected: FAIL — `Cannot find module '../build-app.js'` (package doesn't exist in workspace yet either; if pnpm can't resolve the filter, run `pnpm install` first from the repo root to pick up the new workspace member).

- [ ] **Step 7: Write `build-app.ts`**

Create `services/fleet/src/build-app.ts`:

```typescript
import Fastify, { type FastifyInstance } from "fastify";
import { InMemoryFleetRepository } from "./in-memory-fleet-repository.js";
import type { FleetRepository } from "./fleet-repository.js";
import { createFleetInputSchema } from "./types.js";

export interface BuildAppOptions {
  fleetRepo?: FleetRepository;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const fleetRepo = options.fleetRepo ?? new InMemoryFleetRepository();

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/fleets", async (request, reply) => {
    const parsed = createFleetInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid fleet payload", details: parsed.error.flatten() });
    }
    const fleet = await fleetRepo.create(parsed.data);
    return reply.status(201).send(fleet);
  });

  app.get("/fleets", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    if (typeof query.org_id !== "string" || query.org_id.length === 0) {
      return reply.status(400).send({ error: "org_id query param is required" });
    }
    const fleets = await fleetRepo.list(query.org_id);
    return reply.status(200).send({ fleets });
  });

  return app;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @gamopls/fleet test`
Expected: PASS, 3 tests.

- [ ] **Step 9: Write the Prisma implementation**

Create `services/fleet/src/prisma-fleet-repository.ts`:

```typescript
import type { PrismaClient } from "@gamopls/db";
import type { FleetRepository } from "./fleet-repository.js";
import type { CreateFleetInput, Fleet } from "./types.js";

export class PrismaFleetRepository implements FleetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(db: any): Fleet {
    return {
      id: db.id,
      org_id: db.org_id,
      name: db.name,
      created_at: db.created_at.toISOString(),
      updated_at: db.updated_at.toISOString(),
    };
  }

  async create(input: CreateFleetInput): Promise<Fleet> {
    const db = await this.prisma.fleet.create({ data: { org_id: input.org_id, name: input.name } });
    return this.map(db);
  }

  async list(org_id: string): Promise<Fleet[]> {
    const rows = await this.prisma.fleet.findMany({ where: { org_id }, orderBy: { created_at: "desc" } });
    return rows.map((r: any) => this.map(r));
  }
}
```

- [ ] **Step 10: Write `index.ts`**

Create `services/fleet/src/index.ts`:

```typescript
export { buildApp } from "./build-app.js";
export type { FleetRepository } from "./fleet-repository.js";
export { InMemoryFleetRepository } from "./in-memory-fleet-repository.js";
export { PrismaFleetRepository } from "./prisma-fleet-repository.js";
export { fleetSchema, createFleetInputSchema } from "./types.js";
export type { Fleet, CreateFleetInput } from "./types.js";
```

- [ ] **Step 11: Register the workspace member and install**

Run: `pnpm install` from the repo root.
Expected: `services/fleet` appears as a linked workspace package (it matches the existing `services/*` glob in `pnpm-workspace.yaml`, no config change needed — verify with `grep -A2 "services" pnpm-workspace.yaml`).

- [ ] **Step 12: Run full test suite for the new package**

Run: `pnpm --filter @gamopls/fleet test`
Expected: PASS, 3 tests.

- [ ] **Step 13: Commit**

```bash
git add services/fleet pnpm-lock.yaml
git commit -m "feat(fleet): scaffold services/fleet with Fleet CRUD (in-memory + Prisma)"
```

---

### Task 5: `services/fleet` — Driver CRUD

**Files:**
- Modify: `services/fleet/src/types.ts` (add Driver schemas)
- Create: `services/fleet/src/driver-repository.ts`
- Create: `services/fleet/src/in-memory-driver-repository.ts`
- Create: `services/fleet/src/prisma-driver-repository.ts`
- Modify: `services/fleet/src/build-app.ts` (add Driver routes)
- Modify: `services/fleet/src/index.ts` (export new symbols)
- Modify: `services/fleet/src/__tests__/build-app.test.ts` (add Driver tests)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `DriverRepository` (`create`, `list(org_id, fleet_id)`, `update`), routes `POST /drivers`, `GET /drivers?org_id=&fleet_id=`, `PATCH /drivers/:id`. Task 7 (assignment) consumes `Driver` type from here.

- [ ] **Step 1: Add Driver schemas to `types.ts`**

Append to `services/fleet/src/types.ts`:

```typescript
export const driverStatusSchema = z.enum(["active", "inactive"]);

export const driverSchema = z.object({
  id: z.string().min(1),
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().nullable(),
  license_number: z.string().nullable(),
  status: driverStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Driver = z.infer<typeof driverSchema>;

export const createDriverInputSchema = z.object({
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(1).nullable().default(null),
  license_number: z.string().min(1).nullable().default(null),
});
export type CreateDriverInput = z.infer<typeof createDriverInputSchema>;

export const updateDriverInputSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).nullable().optional(),
  license_number: z.string().min(1).nullable().optional(),
  status: driverStatusSchema.optional(),
});
export type UpdateDriverInput = z.infer<typeof updateDriverInputSchema>;
```

- [ ] **Step 2: Add Driver tests to `build-app.test.ts`**

Append inside the existing `describe` block in `services/fleet/src/__tests__/build-app.test.ts`:

```typescript
  it("creates, lists, and updates a driver", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/drivers",
      payload: { org_id: "org-1", fleet_id: "fleet-1", name: "Kumar S" },
    });
    expect(createRes.statusCode).toBe(201);
    const driver = createRes.json();
    expect(driver.status).toBe("active");

    const listRes = await app.inject({ method: "GET", url: "/drivers?org_id=org-1&fleet_id=fleet-1" });
    expect(listRes.json().drivers).toHaveLength(1);

    const updateRes = await app.inject({
      method: "PATCH",
      url: `/drivers/${driver.id}`,
      payload: { phone: "9876543210" },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().phone).toBe("9876543210");
  });

  it("rejects driver creation with an empty name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/drivers",
      payload: { org_id: "org-1", fleet_id: "fleet-1", name: "" },
    });
    expect(res.statusCode).toBe(400);
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @gamopls/fleet test -- build-app`
Expected: FAIL — 404 on `POST /drivers` (route doesn't exist yet).

- [ ] **Step 4: Write the repository port + in-memory implementation**

Create `services/fleet/src/driver-repository.ts`:

```typescript
import type { CreateDriverInput, Driver, UpdateDriverInput } from "./types.js";

export interface DriverRepository {
  create(input: CreateDriverInput): Promise<Driver>;
  get(id: string, org_id: string, fleet_id: string): Promise<Driver | null>;
  list(org_id: string, fleet_id: string): Promise<Driver[]>;
  update(id: string, org_id: string, fleet_id: string, patch: UpdateDriverInput): Promise<Driver | null>;
}
```

Create `services/fleet/src/in-memory-driver-repository.ts`:

```typescript
import { randomUUID } from "node:crypto";
import type { DriverRepository } from "./driver-repository.js";
import type { CreateDriverInput, Driver, UpdateDriverInput } from "./types.js";

export class InMemoryDriverRepository implements DriverRepository {
  private readonly rows: Driver[] = [];

  async create(input: CreateDriverInput): Promise<Driver> {
    const now = new Date().toISOString();
    const driver: Driver = {
      id: randomUUID(),
      org_id: input.org_id,
      fleet_id: input.fleet_id,
      name: input.name,
      phone: input.phone,
      license_number: input.license_number,
      status: "active",
      created_at: now,
      updated_at: now,
    };
    this.rows.push(driver);
    return driver;
  }

  async get(id: string, org_id: string, fleet_id: string): Promise<Driver | null> {
    return this.rows.find((d) => d.id === id && d.org_id === org_id && d.fleet_id === fleet_id) ?? null;
  }

  async list(org_id: string, fleet_id: string): Promise<Driver[]> {
    return this.rows.filter((d) => d.org_id === org_id && d.fleet_id === fleet_id);
  }

  async update(id: string, org_id: string, fleet_id: string, patch: UpdateDriverInput): Promise<Driver | null> {
    const idx = this.rows.findIndex((d) => d.id === id && d.org_id === org_id && d.fleet_id === fleet_id);
    if (idx === -1) return null;
    this.rows[idx] = { ...this.rows[idx], ...patch, updated_at: new Date().toISOString() };
    return this.rows[idx];
  }
}
```

- [ ] **Step 5: Add Driver routes to `build-app.ts`**

In `services/fleet/src/build-app.ts`, add the import and wire the repo into `BuildAppOptions`:

```typescript
import { InMemoryDriverRepository } from "./in-memory-driver-repository.js";
import type { DriverRepository } from "./driver-repository.js";
import { createFleetInputSchema, createDriverInputSchema, updateDriverInputSchema } from "./types.js";
```

Update `BuildAppOptions` and the top of `buildApp`:

```typescript
export interface BuildAppOptions {
  fleetRepo?: FleetRepository;
  driverRepo?: DriverRepository;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const fleetRepo = options.fleetRepo ?? new InMemoryFleetRepository();
  const driverRepo = options.driverRepo ?? new InMemoryDriverRepository();
```

Add before the final `return app;`:

```typescript
  function tenancyQuery(query: unknown): { org_id: string; fleet_id: string } | null {
    if (typeof query !== "object" || query === null) return null;
    const q = query as Record<string, unknown>;
    if (typeof q.org_id !== "string" || typeof q.fleet_id !== "string") return null;
    if (q.org_id.length === 0 || q.fleet_id.length === 0) return null;
    return { org_id: q.org_id, fleet_id: q.fleet_id };
  }

  app.post("/drivers", async (request, reply) => {
    const parsed = createDriverInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid driver payload", details: parsed.error.flatten() });
    }
    const driver = await driverRepo.create(parsed.data);
    return reply.status(201).send(driver);
  });

  app.get("/drivers", async (request, reply) => {
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const drivers = await driverRepo.list(tenancy.org_id, tenancy.fleet_id);
    return reply.status(200).send({ drivers });
  });

  app.patch("/drivers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const parsed = updateDriverInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid driver payload", details: parsed.error.flatten() });
    }
    const driver = await driverRepo.update(id, tenancy.org_id, tenancy.fleet_id, parsed.data);
    if (!driver) return reply.status(404).send({ error: "not found" });
    return reply.status(200).send(driver);
  });
```

Note: the test in Step 2 calls `PATCH /drivers/:id` without `org_id`/`fleet_id` query params — fix the test to include them (`url: \`/drivers/${driver.id}?org_id=org-1&fleet_id=fleet-1\``) since this route is tenancy-scoped like every other mutating route in this repo.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @gamopls/fleet test -- build-app`
Expected: PASS, 5 tests.

- [ ] **Step 7: Write the Prisma implementation**

Create `services/fleet/src/prisma-driver-repository.ts`:

```typescript
import type { PrismaClient } from "@gamopls/db";
import type { DriverRepository } from "./driver-repository.js";
import type { CreateDriverInput, Driver, UpdateDriverInput } from "./types.js";

export class PrismaDriverRepository implements DriverRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(db: any): Driver {
    return {
      id: db.id,
      org_id: db.org_id,
      fleet_id: db.fleet_id,
      name: db.name,
      phone: db.phone,
      license_number: db.license_number,
      status: db.status,
      created_at: db.created_at.toISOString(),
      updated_at: db.updated_at.toISOString(),
    };
  }

  async create(input: CreateDriverInput): Promise<Driver> {
    const db = await this.prisma.driver.create({
      data: {
        org_id: input.org_id,
        fleet_id: input.fleet_id,
        name: input.name,
        phone: input.phone,
        license_number: input.license_number,
      },
    });
    return this.map(db);
  }

  async get(id: string, org_id: string, fleet_id: string): Promise<Driver | null> {
    const db = await this.prisma.driver.findFirst({ where: { id, org_id, fleet_id } });
    return db ? this.map(db) : null;
  }

  async list(org_id: string, fleet_id: string): Promise<Driver[]> {
    const rows = await this.prisma.driver.findMany({ where: { org_id, fleet_id }, orderBy: { created_at: "desc" } });
    return rows.map((r: any) => this.map(r));
  }

  async update(id: string, org_id: string, fleet_id: string, patch: UpdateDriverInput): Promise<Driver | null> {
    const existing = await this.prisma.driver.findFirst({ where: { id, org_id, fleet_id } });
    if (!existing) return null;
    const db = await this.prisma.driver.update({ where: { id }, data: patch });
    return this.map(db);
  }
}
```

- [ ] **Step 8: Export new symbols from `index.ts`**

Append to `services/fleet/src/index.ts`:

```typescript
export type { DriverRepository } from "./driver-repository.js";
export { InMemoryDriverRepository } from "./in-memory-driver-repository.js";
export { PrismaDriverRepository } from "./prisma-driver-repository.js";
export { driverSchema, createDriverInputSchema, updateDriverInputSchema } from "./types.js";
export type { Driver, CreateDriverInput, UpdateDriverInput } from "./types.js";
```

- [ ] **Step 9: Run full test suite and typecheck**

Run: `pnpm --filter @gamopls/fleet test && pnpm --filter @gamopls/fleet exec tsc --noEmit -p .`
Expected: all PASS, no type errors.

- [ ] **Step 10: Commit**

```bash
git add services/fleet
git commit -m "feat(fleet): add Driver CRUD (in-memory + Prisma)"
```

---

### Task 6: `services/fleet` — vehicle-plugin HTTP client + Asset registry + vehicle onboarding

**Files:**
- Create: `services/fleet/src/vehicle-plugin-client.ts`
- Modify: `services/fleet/src/types.ts` (add Asset schemas)
- Create: `services/fleet/src/asset-repository.ts`
- Create: `services/fleet/src/in-memory-asset-repository.ts`
- Create: `services/fleet/src/prisma-asset-repository.ts`
- Modify: `services/fleet/src/build-app.ts` (add Asset routes + wire vehicle-plugin client)
- Modify: `services/fleet/src/index.ts`
- Modify: `services/fleet/src/__tests__/build-app.test.ts`

**Interfaces:**
- Consumes: HTTP contract from Task 3 (`POST /vehicle-details`, `GET /vehicle-details/:assetId`).
- Produces: `AssetRepository` (`create`, `get`, `list`, `delete`, `updateHealth`), `VehiclePluginClient` (`createVehicleDetails`, `getVehicleDetails`), routes `POST /assets`, `GET /assets`, `GET /assets/:id`. Task 7 consumes `Asset` type; Task 8 (NATS subscription) consumes `AssetRepository.updateHealth`.

- [ ] **Step 1: Add Asset schemas to `types.ts`**

Append to `services/fleet/src/types.ts`:

```typescript
export const assetSchema = z.object({
  id: z.string().min(1),
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  type: z.string().min(1),
  display_label: z.string().min(1),
  health_score: z.number().min(0).max(100),
  telemetry: z.record(z.string(), z.unknown()),
  telemetry_updated_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Asset = z.infer<typeof assetSchema>;

/** Vehicle-specific fields, entered once at onboarding, forwarded to plugins/asset-vehicle — never stored here. */
export const createVehicleAssetInputSchema = z.object({
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  plateNumber: z.string().min(1),
  vehicleType: z.enum(["truck", "van", "car", "bike", "bus", "other"]),
  fuelType: z.enum(["petrol", "diesel", "electric", "hybrid", "cng"]),
  make: z.string().min(1).nullable().default(null),
  model: z.string().min(1).nullable().default(null),
  color: z.string().min(1).nullable().default(null),
  year: z.string().min(1).nullable().default(null),
  vin: z.string().min(1).nullable().default(null),
  fuelCapacityLiters: z.number().positive().nullable().default(null),
  odometerKm: z.number().min(0).default(0),
});
export type CreateVehicleAssetInput = z.infer<typeof createVehicleAssetInputSchema>;
```

- [ ] **Step 2: Add Asset tests to `build-app.test.ts`**

Append to the `describe` block:

```typescript
  it("onboards a vehicle asset, then lists and fetches it", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/assets",
      payload: {
        org_id: "org-1",
        fleet_id: "fleet-1",
        plateNumber: "TN-22-CD-9999",
        vehicleType: "van",
        fuelType: "diesel",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const asset = createRes.json();
    expect(asset.type).toBe("vehicle");
    expect(asset.vehicleDetails.plateNumber).toBe("TN-22-CD-9999");

    const listRes = await app.inject({ method: "GET", url: "/assets?org_id=org-1&fleet_id=fleet-1" });
    expect(listRes.json().assets).toHaveLength(1);

    const getRes = await app.inject({ method: "GET", url: `/assets/${asset.id}?org_id=org-1&fleet_id=fleet-1` });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().vehicleDetails.vehicleType).toBe("van");
  });

  it("rejects vehicle onboarding with an invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/assets",
      payload: { org_id: "org-1", fleet_id: "fleet-1" },
    });
    expect(res.statusCode).toBe(400);
  });
```

This requires `buildApp` to accept an injectable `vehiclePluginClient` for tests — added in Step 5 below.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @gamopls/fleet test -- build-app`
Expected: FAIL — 404 on `POST /assets`.

- [ ] **Step 4: Write the vehicle-plugin HTTP client**

Create `services/fleet/src/vehicle-plugin-client.ts`:

```typescript
/**
 * HTTP client for plugins/asset-vehicle's VehicleDetails API. This is the
 * ONLY way services/fleet reaches vehicle-specific data — never a direct
 * import of plugins/asset-vehicle (CLAUDE.md).
 */
export interface VehicleDetailsResponse {
  assetId: string;
  plateNumber: string;
  vehicleType: string;
  fuelType: string;
  make: string | null;
  model: string | null;
  color: string | null;
  year: string | null;
  vin: string | null;
  fuelCapacityLiters: number | null;
  odometerKm: number;
}

export class VehiclePluginClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "VehiclePluginClientError";
  }
}

export interface VehiclePluginClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class VehiclePluginClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VehiclePluginClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createVehicleDetails(input: {
    assetId: string;
    plateNumber: string;
    vehicleType: string;
    fuelType: string;
    make: string | null;
    model: string | null;
    color: string | null;
    year: string | null;
    vin: string | null;
    fuelCapacityLiters: number | null;
    odometerKm: number;
  }): Promise<VehicleDetailsResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/vehicle-details`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new VehiclePluginClientError(`vehicle-plugin create failed: ${res.status}`, res.status);
    }
    return (await res.json()) as VehicleDetailsResponse;
  }

  async getVehicleDetails(assetId: string): Promise<VehicleDetailsResponse | null> {
    const res = await this.fetchImpl(`${this.baseUrl}/vehicle-details/${assetId}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new VehiclePluginClientError(`vehicle-plugin get failed: ${res.status}`, res.status);
    }
    return (await res.json()) as VehicleDetailsResponse;
  }
}
```

- [ ] **Step 5: Write the Asset repository (port + in-memory)**

Create `services/fleet/src/asset-repository.ts`:

```typescript
import type { Asset } from "./types.js";

export interface CreateAssetInput {
  org_id: string;
  fleet_id: string;
  type: string;
  display_label: string;
}

export interface AssetRepository {
  create(input: CreateAssetInput): Promise<Asset>;
  get(id: string, org_id: string, fleet_id: string): Promise<Asset | null>;
  list(org_id: string, fleet_id: string): Promise<Asset[]>;
  delete(id: string): Promise<void>;
  updateHealth(id: string, health_score: number, telemetry: Record<string, unknown>): Promise<void>;
}
```

Create `services/fleet/src/in-memory-asset-repository.ts`:

```typescript
import { randomUUID } from "node:crypto";
import type { AssetRepository, CreateAssetInput } from "./asset-repository.js";
import type { Asset } from "./types.js";

export class InMemoryAssetRepository implements AssetRepository {
  private readonly rows: Asset[] = [];

  async create(input: CreateAssetInput): Promise<Asset> {
    const now = new Date().toISOString();
    const asset: Asset = {
      id: randomUUID(),
      org_id: input.org_id,
      fleet_id: input.fleet_id,
      type: input.type,
      display_label: input.display_label,
      health_score: 100,
      telemetry: {},
      telemetry_updated_at: null,
      created_at: now,
      updated_at: now,
    };
    this.rows.push(asset);
    return asset;
  }

  async get(id: string, org_id: string, fleet_id: string): Promise<Asset | null> {
    return this.rows.find((a) => a.id === id && a.org_id === org_id && a.fleet_id === fleet_id) ?? null;
  }

  async list(org_id: string, fleet_id: string): Promise<Asset[]> {
    return this.rows.filter((a) => a.org_id === org_id && a.fleet_id === fleet_id);
  }

  async delete(id: string): Promise<void> {
    const idx = this.rows.findIndex((a) => a.id === id);
    if (idx !== -1) this.rows.splice(idx, 1);
  }

  async updateHealth(id: string, health_score: number, telemetry: Record<string, unknown>): Promise<void> {
    const asset = this.rows.find((a) => a.id === id);
    if (!asset) return;
    asset.health_score = health_score;
    asset.telemetry = telemetry;
    asset.telemetry_updated_at = new Date().toISOString();
    asset.updated_at = asset.telemetry_updated_at;
  }
}
```

- [ ] **Step 6: Add Asset routes + vehicle-plugin client wiring to `build-app.ts`**

Add imports:

```typescript
import { randomUUID } from "node:crypto";
import { InMemoryAssetRepository } from "./in-memory-asset-repository.js";
import type { AssetRepository } from "./asset-repository.js";
import { VehiclePluginClient, VehiclePluginClientError } from "./vehicle-plugin-client.js";
import type { VehiclePluginClient as VehiclePluginClientType } from "./vehicle-plugin-client.js";
import { createVehicleAssetInputSchema } from "./types.js";
```

Update `BuildAppOptions` and the top of `buildApp`:

```typescript
export interface BuildAppOptions {
  fleetRepo?: FleetRepository;
  driverRepo?: DriverRepository;
  assetRepo?: AssetRepository;
  vehiclePluginClient?: VehiclePluginClientType;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const fleetRepo = options.fleetRepo ?? new InMemoryFleetRepository();
  const driverRepo = options.driverRepo ?? new InMemoryDriverRepository();
  const assetRepo = options.assetRepo ?? new InMemoryAssetRepository();
  const vehiclePluginClient =
    options.vehiclePluginClient ??
    new VehiclePluginClient({ baseUrl: process.env.VEHICLE_PLUGIN_URL ?? "http://localhost:4700" });
```

Add before the final `return app;`:

```typescript
  app.post("/assets", async (request, reply) => {
    const parsed = createVehicleAssetInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid asset payload", details: parsed.error.flatten() });
    }
    const input = parsed.data;
    const asset = await assetRepo.create({
      org_id: input.org_id,
      fleet_id: input.fleet_id,
      type: "vehicle",
      display_label: `${input.plateNumber} (${input.vehicleType})`,
    });

    try {
      const vehicleDetails = await vehiclePluginClient.createVehicleDetails({
        assetId: asset.id,
        plateNumber: input.plateNumber,
        vehicleType: input.vehicleType,
        fuelType: input.fuelType,
        make: input.make,
        model: input.model,
        color: input.color,
        year: input.year,
        vin: input.vin,
        fuelCapacityLiters: input.fuelCapacityLiters,
        odometerKm: input.odometerKm,
      });
      return reply.status(201).send({ ...asset, vehicleDetails });
    } catch (err) {
      // Compensating action: don't leave an orphaned Asset with no vehicle details.
      await assetRepo.delete(asset.id);
      if (err instanceof VehiclePluginClientError) {
        return reply.status(502).send({ error: "failed to create vehicle details", detail: err.message });
      }
      throw err;
    }
  });

  app.get("/assets", async (request, reply) => {
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const assets = await assetRepo.list(tenancy.org_id, tenancy.fleet_id);
    return reply.status(200).send({ assets });
  });

  app.get("/assets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const asset = await assetRepo.get(id, tenancy.org_id, tenancy.fleet_id);
    if (!asset) return reply.status(404).send({ error: "not found" });
    const vehicleDetails = asset.type === "vehicle" ? await vehiclePluginClient.getVehicleDetails(id) : null;
    return reply.status(200).send({ ...asset, vehicleDetails });
  });
```

Remove the now-unused `randomUUID` import if it was added speculatively — it isn't needed in `build-app.ts` (only in the repository files), so skip adding it there.

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @gamopls/fleet test -- build-app`
Expected: PASS, 7 tests. (The two new tests from Step 2 use the default in-memory `VehiclePluginClient`, which will fail to connect since nothing is listening on `localhost:4700` in the test environment — fix this by passing an injectable fake in the test file instead: add a `FakeVehiclePluginClient` inline in the test that implements the same two methods against an in-memory `Map`, and pass it as `vehiclePluginClient` to `buildApp()` in `beforeEach`.)

Add this to `services/fleet/src/__tests__/build-app.test.ts`, replacing the `beforeEach`:

```typescript
class FakeVehiclePluginClient {
  private readonly store = new Map<string, any>();

  async createVehicleDetails(input: any) {
    const record = { ...input };
    this.store.set(input.assetId, record);
    return record;
  }

  async getVehicleDetails(assetId: string) {
    return this.store.get(assetId) ?? null;
  }
}

describe("fleet app — Fleet REST API", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({
      fleetRepo: new InMemoryFleetRepository(),
      driverRepo: new InMemoryDriverRepository(),
      assetRepo: new InMemoryAssetRepository(),
      vehiclePluginClient: new FakeVehiclePluginClient() as any,
    });
  });
```

Add the corresponding imports at the top of the test file: `InMemoryDriverRepository`, `InMemoryAssetRepository`.

Re-run: `pnpm --filter @gamopls/fleet test -- build-app`
Expected: PASS, 7 tests.

- [ ] **Step 8: Write the Prisma Asset repository**

Create `services/fleet/src/prisma-asset-repository.ts`:

```typescript
import type { PrismaClient } from "@gamopls/db";
import type { AssetRepository, CreateAssetInput } from "./asset-repository.js";
import type { Asset } from "./types.js";

export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(db: any): Asset {
    return {
      id: db.id,
      org_id: db.org_id,
      fleet_id: db.fleet_id,
      type: db.type,
      display_label: db.display_label,
      health_score: db.health_score,
      telemetry: db.telemetry as Record<string, unknown>,
      telemetry_updated_at: db.telemetry_updated_at ? db.telemetry_updated_at.toISOString() : null,
      created_at: db.created_at.toISOString(),
      updated_at: db.updated_at.toISOString(),
    };
  }

  async create(input: CreateAssetInput): Promise<Asset> {
    const db = await this.prisma.asset.create({
      data: {
        org_id: input.org_id,
        fleet_id: input.fleet_id,
        type: input.type,
        display_label: input.display_label,
      },
    });
    return this.map(db);
  }

  async get(id: string, org_id: string, fleet_id: string): Promise<Asset | null> {
    const db = await this.prisma.asset.findFirst({ where: { id, org_id, fleet_id } });
    return db ? this.map(db) : null;
  }

  async list(org_id: string, fleet_id: string): Promise<Asset[]> {
    const rows = await this.prisma.asset.findMany({ where: { org_id, fleet_id }, orderBy: { created_at: "desc" } });
    return rows.map((r: any) => this.map(r));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.asset.delete({ where: { id } }).catch(() => undefined);
  }

  async updateHealth(id: string, health_score: number, telemetry: Record<string, unknown>): Promise<void> {
    await this.prisma.asset.update({
      where: { id },
      data: { health_score, telemetry, telemetry_updated_at: new Date() },
    });
  }
}
```

- [ ] **Step 9: Export new symbols from `index.ts`**

Append to `services/fleet/src/index.ts`:

```typescript
export type { AssetRepository, CreateAssetInput } from "./asset-repository.js";
export { InMemoryAssetRepository } from "./in-memory-asset-repository.js";
export { PrismaAssetRepository } from "./prisma-asset-repository.js";
export { VehiclePluginClient, VehiclePluginClientError } from "./vehicle-plugin-client.js";
export { assetSchema, createVehicleAssetInputSchema } from "./types.js";
export type { Asset, CreateVehicleAssetInput } from "./types.js";
```

- [ ] **Step 10: Run full test suite and typecheck**

Run: `pnpm --filter @gamopls/fleet test && pnpm --filter @gamopls/fleet exec tsc --noEmit -p .`
Expected: all PASS, no type errors.

- [ ] **Step 11: Commit**

```bash
git add services/fleet
git commit -m "feat(fleet): add vehicle onboarding (Asset registry + vehicle-plugin HTTP client)"
```

---

### Task 7: `services/fleet` — driver assignment with history

**Files:**
- Modify: `services/fleet/src/types.ts` (add DriverAssignment schemas)
- Create: `services/fleet/src/assignment-repository.ts`
- Create: `services/fleet/src/in-memory-assignment-repository.ts`
- Create: `services/fleet/src/prisma-assignment-repository.ts`
- Modify: `services/fleet/src/build-app.ts` (add assignment routes)
- Modify: `services/fleet/src/index.ts`
- Modify: `services/fleet/src/__tests__/build-app.test.ts`

**Interfaces:**
- Consumes: `AssetRepository`, `DriverRepository` from Tasks 5-6 (to validate the asset/driver exist before assigning).
- Produces: `AssignmentRepository` (`assign` — closes any open assignment then creates a new one; `unassignCurrent`; `history`; `current`), routes `POST /assets/:id/assignments`, `DELETE /assets/:id/assignments/current`, `GET /assets/:id/assignments`.

- [ ] **Step 1: Add DriverAssignment schema to `types.ts`**

Append to `services/fleet/src/types.ts`:

```typescript
export const driverAssignmentSchema = z.object({
  id: z.string().min(1),
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  asset_id: z.string().min(1),
  driver_id: z.string().min(1),
  assigned_at: z.string().datetime(),
  unassigned_at: z.string().datetime().nullable(),
});
export type DriverAssignment = z.infer<typeof driverAssignmentSchema>;

export const assignDriverInputSchema = z.object({
  driver_id: z.string().min(1),
});
export type AssignDriverInput = z.infer<typeof assignDriverInputSchema>;
```

- [ ] **Step 2: Add assignment tests to `build-app.test.ts`**

Append to the `describe` block:

```typescript
  it("assigns a driver to a vehicle, reassigns, and tracks history", async () => {
    const assetRes = await app.inject({
      method: "POST",
      url: "/assets",
      payload: { org_id: "org-1", fleet_id: "fleet-1", plateNumber: "TN-05-EF-1111", vehicleType: "car", fuelType: "petrol" },
    });
    const asset = assetRes.json();

    const driverARes = await app.inject({
      method: "POST",
      url: "/drivers",
      payload: { org_id: "org-1", fleet_id: "fleet-1", name: "Driver A" },
    });
    const driverA = driverARes.json();

    const driverBRes = await app.inject({
      method: "POST",
      url: "/drivers",
      payload: { org_id: "org-1", fleet_id: "fleet-1", name: "Driver B" },
    });
    const driverB = driverBRes.json();

    const assignARes = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/assignments?org_id=org-1&fleet_id=fleet-1`,
      payload: { driver_id: driverA.id },
    });
    expect(assignARes.statusCode).toBe(201);
    expect(assignARes.json().unassigned_at).toBeNull();

    // Reassigning should close driver A's open assignment.
    const assignBRes = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/assignments?org_id=org-1&fleet_id=fleet-1`,
      payload: { driver_id: driverB.id },
    });
    expect(assignBRes.statusCode).toBe(201);

    const historyRes = await app.inject({
      method: "GET",
      url: `/assets/${asset.id}/assignments?org_id=org-1&fleet_id=fleet-1`,
    });
    const history = historyRes.json().assignments;
    expect(history).toHaveLength(2);
    expect(history.find((a: any) => a.driver_id === driverA.id).unassigned_at).not.toBeNull();
    expect(history.find((a: any) => a.driver_id === driverB.id).unassigned_at).toBeNull();

    const unassignRes = await app.inject({
      method: "DELETE",
      url: `/assets/${asset.id}/assignments/current?org_id=org-1&fleet_id=fleet-1`,
    });
    expect(unassignRes.statusCode).toBe(200);

    const historyAfterRes = await app.inject({
      method: "GET",
      url: `/assets/${asset.id}/assignments?org_id=org-1&fleet_id=fleet-1`,
    });
    expect(historyAfterRes.json().assignments.every((a: any) => a.unassigned_at !== null)).toBe(true);
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @gamopls/fleet test -- build-app`
Expected: FAIL — 404 on `POST /assets/:id/assignments`.

- [ ] **Step 4: Write the repository port + in-memory implementation**

Create `services/fleet/src/assignment-repository.ts`:

```typescript
import type { DriverAssignment } from "./types.js";

export interface AssignmentRepository {
  /** Closes any open assignment for `asset_id`, then creates a new open one for `driver_id`. */
  assign(org_id: string, fleet_id: string, asset_id: string, driver_id: string): Promise<DriverAssignment>;
  /** Closes the open assignment for `asset_id`, if any. Returns it, or null if none was open. */
  unassignCurrent(org_id: string, fleet_id: string, asset_id: string): Promise<DriverAssignment | null>;
  history(org_id: string, fleet_id: string, asset_id: string): Promise<DriverAssignment[]>;
}
```

Create `services/fleet/src/in-memory-assignment-repository.ts`:

```typescript
import { randomUUID } from "node:crypto";
import type { AssignmentRepository } from "./assignment-repository.js";
import type { DriverAssignment } from "./types.js";

export class InMemoryAssignmentRepository implements AssignmentRepository {
  private readonly rows: DriverAssignment[] = [];

  async assign(org_id: string, fleet_id: string, asset_id: string, driver_id: string): Promise<DriverAssignment> {
    await this.unassignCurrent(org_id, fleet_id, asset_id);
    const record: DriverAssignment = {
      id: randomUUID(),
      org_id,
      fleet_id,
      asset_id,
      driver_id,
      assigned_at: new Date().toISOString(),
      unassigned_at: null,
    };
    this.rows.push(record);
    return record;
  }

  async unassignCurrent(org_id: string, fleet_id: string, asset_id: string): Promise<DriverAssignment | null> {
    const open = this.rows.find(
      (a) => a.org_id === org_id && a.fleet_id === fleet_id && a.asset_id === asset_id && a.unassigned_at === null,
    );
    if (!open) return null;
    open.unassigned_at = new Date().toISOString();
    return open;
  }

  async history(org_id: string, fleet_id: string, asset_id: string): Promise<DriverAssignment[]> {
    return this.rows
      .filter((a) => a.org_id === org_id && a.fleet_id === fleet_id && a.asset_id === asset_id)
      .sort((a, b) => b.assigned_at.localeCompare(a.assigned_at));
  }
}
```

- [ ] **Step 5: Add assignment routes to `build-app.ts`**

Add imports:

```typescript
import { InMemoryAssignmentRepository } from "./in-memory-assignment-repository.js";
import type { AssignmentRepository } from "./assignment-repository.js";
import { assignDriverInputSchema } from "./types.js";
```

Update `BuildAppOptions` and the top of `buildApp`:

```typescript
export interface BuildAppOptions {
  fleetRepo?: FleetRepository;
  driverRepo?: DriverRepository;
  assetRepo?: AssetRepository;
  assignmentRepo?: AssignmentRepository;
  vehiclePluginClient?: VehiclePluginClientType;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const fleetRepo = options.fleetRepo ?? new InMemoryFleetRepository();
  const driverRepo = options.driverRepo ?? new InMemoryDriverRepository();
  const assetRepo = options.assetRepo ?? new InMemoryAssetRepository();
  const assignmentRepo = options.assignmentRepo ?? new InMemoryAssignmentRepository();
```

Add before the final `return app;`:

```typescript
  app.post("/assets/:id/assignments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const parsed = assignDriverInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid assignment payload", details: parsed.error.flatten() });
    }
    const asset = await assetRepo.get(id, tenancy.org_id, tenancy.fleet_id);
    if (!asset) return reply.status(404).send({ error: "asset not found" });
    const driver = await driverRepo.get(parsed.data.driver_id, tenancy.org_id, tenancy.fleet_id);
    if (!driver) return reply.status(404).send({ error: "driver not found" });

    const assignment = await assignmentRepo.assign(tenancy.org_id, tenancy.fleet_id, id, parsed.data.driver_id);
    return reply.status(201).send(assignment);
  });

  app.delete("/assets/:id/assignments/current", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const closed = await assignmentRepo.unassignCurrent(tenancy.org_id, tenancy.fleet_id, id);
    if (!closed) return reply.status(404).send({ error: "no open assignment for this asset" });
    return reply.status(200).send(closed);
  });

  app.get("/assets/:id/assignments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const assignments = await assignmentRepo.history(tenancy.org_id, tenancy.fleet_id, id);
    return reply.status(200).send({ assignments });
  });
```

- [ ] **Step 6: Update the test's `beforeEach` to inject `assignmentRepo`**

In `services/fleet/src/__tests__/build-app.test.ts`, add `InMemoryAssignmentRepository` to the imports and to the `buildApp({...})` call in `beforeEach`:

```typescript
    assignmentRepo: new InMemoryAssignmentRepository(),
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @gamopls/fleet test -- build-app`
Expected: PASS, 8 tests.

- [ ] **Step 8: Write the Prisma implementation**

Create `services/fleet/src/prisma-assignment-repository.ts`:

```typescript
import type { PrismaClient } from "@gamopls/db";
import type { AssignmentRepository } from "./assignment-repository.js";
import type { DriverAssignment } from "./types.js";

export class PrismaAssignmentRepository implements AssignmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(db: any): DriverAssignment {
    return {
      id: db.id,
      org_id: db.org_id,
      fleet_id: db.fleet_id,
      asset_id: db.asset_id,
      driver_id: db.driver_id,
      assigned_at: db.assigned_at.toISOString(),
      unassigned_at: db.unassigned_at ? db.unassigned_at.toISOString() : null,
    };
  }

  async assign(org_id: string, fleet_id: string, asset_id: string, driver_id: string): Promise<DriverAssignment> {
    return this.prisma.$transaction(async (tx: any) => {
      await tx.driverAssignment.updateMany({
        where: { asset_id, unassigned_at: null },
        data: { unassigned_at: new Date() },
      });
      const created = await tx.driverAssignment.create({
        data: { org_id, fleet_id, asset_id, driver_id },
      });
      return this.map(created);
    });
  }

  async unassignCurrent(org_id: string, fleet_id: string, asset_id: string): Promise<DriverAssignment | null> {
    const open = await this.prisma.driverAssignment.findFirst({
      where: { org_id, fleet_id, asset_id, unassigned_at: null },
    });
    if (!open) return null;
    const updated = await this.prisma.driverAssignment.update({
      where: { id: open.id },
      data: { unassigned_at: new Date() },
    });
    return this.map(updated);
  }

  async history(org_id: string, fleet_id: string, asset_id: string): Promise<DriverAssignment[]> {
    const rows = await this.prisma.driverAssignment.findMany({
      where: { org_id, fleet_id, asset_id },
      orderBy: { assigned_at: "desc" },
    });
    return rows.map((r: any) => this.map(r));
  }
}
```

- [ ] **Step 9: Export new symbols from `index.ts`**

Append to `services/fleet/src/index.ts`:

```typescript
export type { AssignmentRepository } from "./assignment-repository.js";
export { InMemoryAssignmentRepository } from "./in-memory-assignment-repository.js";
export { PrismaAssignmentRepository } from "./prisma-assignment-repository.js";
export { driverAssignmentSchema, assignDriverInputSchema } from "./types.js";
export type { DriverAssignment, AssignDriverInput } from "./types.js";
```

- [ ] **Step 10: Run full test suite and typecheck**

Run: `pnpm --filter @gamopls/fleet test && pnpm --filter @gamopls/fleet exec tsc --noEmit -p .`
Expected: all PASS, no type errors.

- [ ] **Step 11: Commit**

```bash
git add services/fleet
git commit -m "feat(fleet): add driver assignment with full history tracking"
```

---

### Task 8: `services/fleet` — AssetHealthChanged subscription + `server.ts`

**Files:**
- Create: `services/fleet/src/health-subscription.ts`
- Create: `services/fleet/src/server.ts`
- Test: `services/fleet/src/__tests__/health-subscription.test.ts`

**Interfaces:**
- Consumes: `AssetHealthChanged`/`assetHealthChangedSchema` from `@gamopls/event-schemas`, `EventSubscriber` port, `AssetRepository.updateHealth` (Task 6).
- Produces: `subscribeAssetHealthChanged(subscriber: EventSubscriber, assetRepo: AssetRepository): Promise<Subscription>` — mirrors `services/board/src/task-suggested-handler.ts` exactly.

- [ ] **Step 1: Write the failing test**

Create `services/fleet/src/__tests__/health-subscription.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { ASSET_HEALTH_CHANGED } from "@gamopls/event-schemas";
import { subscribeAssetHealthChanged } from "../health-subscription.js";
import { InMemoryAssetRepository } from "../in-memory-asset-repository.js";

describe("subscribeAssetHealthChanged", () => {
  it("updates the asset's health score and telemetry on a valid event", async () => {
    const assetRepo = new InMemoryAssetRepository();
    const asset = await assetRepo.create({ org_id: "org-1", fleet_id: "fleet-1", type: "vehicle", display_label: "TN-01" });

    let handler: (payload: unknown) => Promise<void>;
    const fakeSubscriber = {
      subscribe: vi.fn(async (_subject: string, h: (payload: unknown) => Promise<void>) => {
        handler = h;
        return { unsubscribe: async () => {} };
      }),
    };

    await subscribeAssetHealthChanged(fakeSubscriber as any, assetRepo);
    expect(fakeSubscriber.subscribe).toHaveBeenCalledWith(ASSET_HEALTH_CHANGED, expect.any(Function));

    await handler!({
      type: ASSET_HEALTH_CHANGED,
      org_id: "org-1",
      fleet_id: "fleet-1",
      timestamp: new Date().toISOString(),
      asset_id: asset.id,
      healthScore: 82,
      telemetry: { fuel_pct: 54, battery_pct: 76, engine_temp_c: 91.2, odometer_km: 15234 },
    });

    const updated = await assetRepo.get(asset.id, "org-1", "fleet-1");
    expect(updated?.health_score).toBe(82);
    expect(updated?.telemetry).toEqual({ fuel_pct: 54, battery_pct: 76, engine_temp_c: 91.2, odometer_km: 15234 });
  });

  it("drops a malformed payload without throwing", async () => {
    const assetRepo = new InMemoryAssetRepository();
    let handler: (payload: unknown) => Promise<void>;
    const fakeSubscriber = {
      subscribe: vi.fn(async (_subject: string, h: (payload: unknown) => Promise<void>) => {
        handler = h;
        return { unsubscribe: async () => {} };
      }),
    };
    await subscribeAssetHealthChanged(fakeSubscriber as any, assetRepo);
    await expect(handler!({ garbage: true })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gamopls/fleet test -- health-subscription`
Expected: FAIL — `Cannot find module '../health-subscription.js'`.

- [ ] **Step 3: Write `health-subscription.ts`**

Create `services/fleet/src/health-subscription.ts`:

```typescript
import { ASSET_HEALTH_CHANGED, assetHealthChangedSchema, type EventSubscriber } from "@gamopls/event-schemas";
import type { AssetRepository } from "./asset-repository.js";

/**
 * Subscribes to AssetHealthChanged and persists the latest health score +
 * sensor telemetry snapshot onto the Asset row — the durable counterpart to
 * services/map's Redis position cache for AssetLocationUpdated. Mirrors
 * services/board's task-suggested-handler.ts pattern: re-validate on
 * receipt, drop-and-log on malformed payloads rather than throw.
 */
export async function subscribeAssetHealthChanged(subscriber: EventSubscriber, assetRepo: AssetRepository) {
  return subscriber.subscribe<unknown>(ASSET_HEALTH_CHANGED, async (raw) => {
    const parsed = assetHealthChangedSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("fleet: dropped malformed AssetHealthChanged payload:", parsed.error.flatten());
      return;
    }
    const event = parsed.data;
    await assetRepo.updateHealth(event.asset_id, event.healthScore, event.telemetry);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gamopls/fleet test -- health-subscription`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write `server.ts`**

Create `services/fleet/src/server.ts`:

```typescript
import { NatsEventBus } from "@gamopls/event-bus-nats";
import { buildApp } from "./build-app.js";
import { InMemoryFleetRepository } from "./in-memory-fleet-repository.js";
import { PrismaFleetRepository } from "./prisma-fleet-repository.js";
import { InMemoryDriverRepository } from "./in-memory-driver-repository.js";
import { PrismaDriverRepository } from "./prisma-driver-repository.js";
import { InMemoryAssetRepository } from "./in-memory-asset-repository.js";
import { PrismaAssetRepository } from "./prisma-asset-repository.js";
import { InMemoryAssignmentRepository } from "./in-memory-assignment-repository.js";
import { PrismaAssignmentRepository } from "./prisma-assignment-repository.js";
import { VehiclePluginClient } from "./vehicle-plugin-client.js";
import { subscribeAssetHealthChanged } from "./health-subscription.js";
import { getPrismaClient } from "@gamopls/db";
import type { FleetRepository } from "./fleet-repository.js";
import type { DriverRepository } from "./driver-repository.js";
import type { AssetRepository } from "./asset-repository.js";
import type { AssignmentRepository } from "./assignment-repository.js";

const port = Number(process.env.PORT ?? 4600);
const host = process.env.HOST ?? "0.0.0.0";
const natsServers = process.env.NATS_URL ?? "nats://localhost:4222";
const databaseUrl = process.env.DATABASE_URL;
const vehiclePluginUrl = process.env.VEHICLE_PLUGIN_URL ?? "http://localhost:4700";

let fleetRepo: FleetRepository;
let driverRepo: DriverRepository;
let assetRepo: AssetRepository;
let assignmentRepo: AssignmentRepository;

if (databaseUrl) {
  console.log("fleet: using Neon Postgres database via Prisma");
  const prisma = getPrismaClient();
  fleetRepo = new PrismaFleetRepository(prisma);
  driverRepo = new PrismaDriverRepository(prisma);
  assetRepo = new PrismaAssetRepository(prisma);
  assignmentRepo = new PrismaAssignmentRepository(prisma);
} else {
  console.warn("fleet: DATABASE_URL not set — running with in-memory (non-persistent) stores.");
  fleetRepo = new InMemoryFleetRepository();
  driverRepo = new InMemoryDriverRepository();
  assetRepo = new InMemoryAssetRepository();
  assignmentRepo = new InMemoryAssignmentRepository();
}

const vehiclePluginClient = new VehiclePluginClient({ baseUrl: vehiclePluginUrl });
const app = buildApp({ fleetRepo, driverRepo, assetRepo, assignmentRepo, vehiclePluginClient });

async function main() {
  try {
    const bus = new NatsEventBus({ servers: natsServers, name: "fleet" });
    await bus.connect();
    await subscribeAssetHealthChanged(bus, assetRepo);
    app.log.info(`fleet: subscribed to AssetHealthChanged via NATS at ${natsServers}`);
  } catch (err) {
    app.log.warn(`fleet: could not connect to NATS at ${natsServers}, AssetHealthChanged subscription disabled: ${err}`);
  }

  await app
    .listen({ port, host })
    .then(() => {
      app.log.info(`fleet listening on http://${host}:${port}`);
    })
    .catch((err) => {
      console.error("fleet failed to start:", err);
      process.exit(1);
    });
}

main();
```

- [ ] **Step 6: Add env vars to `.env.example`**

Append to `.env.example`:

```
FLEET_SERVICE_URL=http://localhost:4600
VEHICLE_PLUGIN_URL=http://localhost:4700
```

- [ ] **Step 7: Run full test suite and typecheck**

Run: `pnpm --filter @gamopls/fleet test && pnpm --filter @gamopls/fleet exec tsc --noEmit -p .`
Expected: all PASS (10 tests across build-app + health-subscription), no type errors.

- [ ] **Step 8: Commit**

```bash
git add services/fleet .env.example
git commit -m "feat(fleet): subscribe to AssetHealthChanged, add server entrypoint"
```

---

### Task 9: `apps/web` — gateway route + fleet-switch endpoint

**Files:**
- Create: `apps/web/app/api/fleet/[...path]/route.ts`
- Create: `apps/web/app/api/switch-fleet/route.ts`
- Test: `apps/web/lib/__tests__/gateway-proxy.test.ts` (verify existing tests still pass — no change needed, just confirm)

**Interfaces:**
- Consumes: `createGatewayHandler` from `lib/gateway-proxy.ts` (existing), `issueJwt`/`verifyJwt`/`buildSessionCookieOptions` from `@gamopls/auth` (existing).
- Produces: `/api/fleet/...` proxying to `services/fleet`; `POST /api/switch-fleet` re-issuing the session JWT with a new `fleet_id` after verifying it belongs to the caller's org.

- [ ] **Step 1: Create the gateway route**

Create `apps/web/app/api/fleet/[...path]/route.ts`:

```typescript
import { createGatewayHandler } from "@/lib/gateway-proxy";

// Gateway to services/fleet — see lib/gateway-proxy.ts for the auth +
// org/fleet scoping contract every service gateway follows.
const handler = createGatewayHandler("FLEET_SERVICE_URL");

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
```

- [ ] **Step 2: Create the fleet-switch endpoint**

Create `apps/web/app/api/switch-fleet/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { issueJwt, verifyJwt, buildSessionCookieOptions, JwtVerificationError, SESSION_COOKIE_NAME } from "@gamopls/auth";

/**
 * Re-issues the session JWT with a new `fleet_id`, after confirming the
 * target fleet belongs to the caller's org (via services/fleet's GET
 * /fleets, the same source of truth the fleet-switcher dropdown lists
 * from — never trusts a client-supplied fleet_id without this check).
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized: missing session" }, { status: 401 });
  }

  let claims;
  try {
    claims = await verifyJwt(token);
  } catch (err) {
    if (err instanceof JwtVerificationError) {
      return NextResponse.json({ error: "Unauthorized: invalid session" }, { status: 401 });
    }
    throw err;
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.fleet_id !== "string" || body.fleet_id.length === 0) {
    return NextResponse.json({ error: "fleet_id is required" }, { status: 400 });
  }

  const fleetServiceUrl = process.env.FLEET_SERVICE_URL;
  if (!fleetServiceUrl) {
    return NextResponse.json({ error: "Gateway misconfigured: FLEET_SERVICE_URL is not set" }, { status: 500 });
  }

  const fleetsRes = await fetch(`${fleetServiceUrl.replace(/\/+$/, "")}/fleets?org_id=${encodeURIComponent(claims.org_id)}`);
  if (!fleetsRes.ok) {
    return NextResponse.json({ error: "Failed to verify fleet ownership" }, { status: 502 });
  }
  const { fleets } = (await fleetsRes.json()) as { fleets: { id: string }[] };
  if (!fleets.some((f) => f.id === body.fleet_id)) {
    return NextResponse.json({ error: "Fleet does not belong to this org" }, { status: 403 });
  }

  const newToken = await issueJwt({
    user_id: claims.user_id,
    org_id: claims.org_id,
    fleet_id: body.fleet_id,
    role: claims.role,
  });
  const cookie = buildSessionCookieOptions(newToken);

  const response = NextResponse.json({ ok: true, fleet_id: body.fleet_id });
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });
  return response;
}
```

- [ ] **Step 3: Add `FLEET_SERVICE_URL` to `apps/web`'s runtime env**

Check `apps/web`'s `.env.local`/`.env` or `turbo.json` `globalEnv`/`env` passthrough list (per this repo's existing `turbo.json` root-env-passthrough setup) — add `FLEET_SERVICE_URL` alongside the existing `MAP_SERVICE_URL`/`BOARD_SERVICE_URL`/etc. entries so it's forwarded the same way. Run: `grep -n "SERVICE_URL" turbo.json` to find the exact list to extend.

- [ ] **Step 4: Verify existing gateway-proxy tests still pass (no regression)**

Run: `pnpm --filter web test -- gateway-proxy`
Expected: PASS (this task doesn't modify `gateway-proxy.ts` itself, only adds a new route file that reuses it — this step is a regression check).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/fleet apps/web/app/api/switch-fleet turbo.json .env.example
git commit -m "feat(web): add fleet gateway route and fleet-switch endpoint"
```

---

### Task 10: `apps/web` — fleet API client + types

**Files:**
- Create: `apps/web/components/fleet/types.ts`
- Create: `apps/web/components/fleet/api.ts`
- Test: `apps/web/components/fleet/__tests__/api.test.ts`

**Interfaces:**
- Produces: `Fleet`, `Driver`, `Asset`, `VehicleDetails`, `DriverAssignment` TS types; `FleetApiError`; `listFleets`, `createFleet`, `listVehicles`, `createVehicle`, `listDrivers`, `createDriver`, `updateDriver`, `assignDriver`, `unassignCurrentDriver`, `listAssignmentHistory` functions. Tasks 11-13 (frontend views) consume all of these.

- [ ] **Step 1: Write `types.ts`**

Create `apps/web/components/fleet/types.ts`:

```typescript
export interface Fleet {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  org_id: string;
  fleet_id: string;
  name: string;
  phone: string | null;
  license_number: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface VehicleDetails {
  assetId: string;
  plateNumber: string;
  vehicleType: "truck" | "van" | "car" | "bike" | "bus" | "other";
  fuelType: "petrol" | "diesel" | "electric" | "hybrid" | "cng";
  make: string | null;
  model: string | null;
  color: string | null;
  year: string | null;
  vin: string | null;
  fuelCapacityLiters: number | null;
  odometerKm: number;
}

export interface Asset {
  id: string;
  org_id: string;
  fleet_id: string;
  type: string;
  display_label: string;
  health_score: number;
  telemetry: Record<string, unknown>;
  telemetry_updated_at: string | null;
  created_at: string;
  updated_at: string;
  vehicleDetails: VehicleDetails | null;
}

export interface DriverAssignment {
  id: string;
  org_id: string;
  fleet_id: string;
  asset_id: string;
  driver_id: string;
  assigned_at: string;
  unassigned_at: string | null;
}

export interface CreateVehicleInput {
  plateNumber: string;
  vehicleType: VehicleDetails["vehicleType"];
  fuelType: VehicleDetails["fuelType"];
  make?: string | null;
  model?: string | null;
  color?: string | null;
  year?: string | null;
  vin?: string | null;
}

export interface CreateDriverInput {
  name: string;
  phone?: string | null;
  license_number?: string | null;
}
```

- [ ] **Step 2: Write `api.ts`**

Create `apps/web/components/fleet/api.ts`:

```typescript
import type {
  Asset,
  CreateDriverInput,
  CreateVehicleInput,
  Driver,
  DriverAssignment,
  Fleet,
} from "./types";

export class FleetApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FleetApiError";
  }
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = typeof body?.error === "string" ? body.error : JSON.stringify(body);
    } catch {
      // ignore parse failure, fall back to statusText
    }
    throw new FleetApiError(detail || response.statusText || "Request failed", response.status);
  }
  return (await response.json()) as T;
}

export async function listFleets(): Promise<Fleet[]> {
  const res = await fetch("/api/fleet/fleets");
  const data = await parseOrThrow<{ fleets: Fleet[] }>(res);
  return data.fleets;
}

export async function createFleet(name: string): Promise<Fleet> {
  const res = await fetch("/api/fleet/fleets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return parseOrThrow<Fleet>(res);
}

export async function listVehicles(): Promise<Asset[]> {
  const res = await fetch("/api/fleet/assets");
  const data = await parseOrThrow<{ assets: Asset[] }>(res);
  return data.assets;
}

export async function createVehicle(input: CreateVehicleInput): Promise<Asset> {
  const res = await fetch("/api/fleet/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseOrThrow<Asset>(res);
}

export async function listDrivers(): Promise<Driver[]> {
  const res = await fetch("/api/fleet/drivers");
  const data = await parseOrThrow<{ drivers: Driver[] }>(res);
  return data.drivers;
}

export async function createDriver(input: CreateDriverInput): Promise<Driver> {
  const res = await fetch("/api/fleet/drivers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseOrThrow<Driver>(res);
}

export async function updateDriver(id: string, patch: Partial<CreateDriverInput>): Promise<Driver> {
  const res = await fetch(`/api/fleet/drivers/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseOrThrow<Driver>(res);
}

export async function assignDriver(assetId: string, driverId: string): Promise<DriverAssignment> {
  const res = await fetch(`/api/fleet/assets/${assetId}/assignments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ driver_id: driverId }),
  });
  return parseOrThrow<DriverAssignment>(res);
}

export async function unassignCurrentDriver(assetId: string): Promise<DriverAssignment> {
  const res = await fetch(`/api/fleet/assets/${assetId}/assignments/current`, { method: "DELETE" });
  return parseOrThrow<DriverAssignment>(res);
}

export async function listAssignmentHistory(assetId: string): Promise<DriverAssignment[]> {
  const res = await fetch(`/api/fleet/assets/${assetId}/assignments`);
  const data = await parseOrThrow<{ assignments: DriverAssignment[] }>(res);
  return data.assignments;
}
```

- [ ] **Step 3: Write the failing test**

Create `apps/web/components/fleet/__tests__/api.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVehicle, FleetApiError, listVehicles } from "../api";

describe("fleet api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listVehicles parses the assets array", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ assets: [{ id: "asset-1" }] }),
    });
    const vehicles = await listVehicles();
    expect(vehicles).toEqual([{ id: "asset-1" }]);
  });

  it("createVehicle throws FleetApiError with the server's error message on failure", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: "invalid asset payload" }),
    });
    await expect(
      createVehicle({ plateNumber: "", vehicleType: "car", fuelType: "petrol" }),
    ).rejects.toThrow(FleetApiError);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter web test -- components/fleet/__tests__/api.test.ts`
Expected: FAIL — `Cannot find module '../api'` (before Step 2 ran) or PASS immediately if run after Step 2 — since Step 2 already wrote the implementation, running the test now should PASS. Run it anyway to confirm the file resolves correctly.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter web test -- components/fleet/__tests__/api.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/fleet
git commit -m "feat(web): add fleet API client module and types"
```

---

### Task 11: `apps/web` — Vehicles list + Add Vehicle form

**Files:**
- Create: `apps/web/components/fleet/VehiclesPanel.tsx`
- Create: `apps/web/components/fleet/AddVehicleForm.tsx`
- Create: `apps/web/components/fleet/VehiclesTable.tsx`
- Test: `apps/web/components/fleet/__tests__/VehiclesPanel.test.tsx`

**Interfaces:**
- Consumes: `listVehicles`, `createVehicle`, `Asset`, `CreateVehicleInput` from Task 10.
- Produces: `<VehiclesPanel />` — self-contained list + form, consumed by Task 14's `app/fleet/page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/fleet/__tests__/VehiclesPanel.test.tsx`:

```typescript
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VehiclesPanel } from "../VehiclesPanel";
import * as fleetApi from "../api";

vi.mock("../api");

describe("VehiclesPanel", () => {
  it("loads and displays vehicles", async () => {
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([
      {
        id: "asset-1",
        org_id: "org-1",
        fleet_id: "fleet-1",
        type: "vehicle",
        display_label: "TN-01-AB-1234 (van)",
        health_score: 91,
        telemetry: { fuel_pct: 60 },
        telemetry_updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        vehicleDetails: {
          assetId: "asset-1",
          plateNumber: "TN-01-AB-1234",
          vehicleType: "van",
          fuelType: "diesel",
          make: null,
          model: null,
          color: null,
          year: null,
          vin: null,
          fuelCapacityLiters: null,
          odometerKm: 12000,
        },
      },
    ]);

    render(<VehiclesPanel />);

    await waitFor(() => expect(screen.getByText("TN-01-AB-1234 (van)")).toBeInTheDocument());
    expect(screen.getByText(/91/)).toBeInTheDocument();
  });

  it("submits the add-vehicle form with only the required fields", async () => {
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([]);
    vi.mocked(fleetApi.createVehicle).mockResolvedValue({} as any);

    render(<VehiclesPanel />);
    await waitFor(() => expect(fleetApi.listVehicles).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Plate number"), { target: { value: "TN-02-CD-5678" } });
    fireEvent.click(screen.getByRole("button", { name: /add vehicle/i }));

    await waitFor(() =>
      expect(fleetApi.createVehicle).toHaveBeenCalledWith(
        expect.objectContaining({ plateNumber: "TN-02-CD-5678", vehicleType: "car", fuelType: "petrol" }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- VehiclesPanel`
Expected: FAIL — `Cannot find module '../VehiclesPanel'`.

- [ ] **Step 3: Write `VehiclesTable.tsx`**

Create `apps/web/components/fleet/VehiclesTable.tsx`:

```typescript
"use client";

import { Badge } from "@gamopls/ui";
import type { Asset } from "./types";

export interface VehiclesTableProps {
  vehicles: Asset[];
}

function healthTone(score: number): "success" | "warning" | "danger" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

export function VehiclesTable({ vehicles }: VehiclesTableProps) {
  if (vehicles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg">
        No vehicles yet — add one above.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
          <th className="py-2">Vehicle</th>
          <th className="py-2">Health</th>
          <th className="py-2">Fuel</th>
          <th className="py-2">Odometer</th>
        </tr>
      </thead>
      <tbody>
        {vehicles.map((v) => (
          <tr key={v.id} className="border-b border-border/50">
            <td className="py-2 font-semibold text-foreground">{v.display_label}</td>
            <td className="py-2">
              <Badge tone={healthTone(v.health_score)}>{v.health_score}</Badge>
            </td>
            <td className="py-2 text-muted-foreground">
              {typeof v.telemetry.fuel_pct === "number" ? `${v.telemetry.fuel_pct}%` : "—"}
            </td>
            <td className="py-2 text-muted-foreground">
              {v.vehicleDetails ? `${v.vehicleDetails.odometerKm.toLocaleString()} km` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Write `AddVehicleForm.tsx`**

Create `apps/web/components/fleet/AddVehicleForm.tsx`:

```typescript
"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@gamopls/ui";
import { Input } from "../ui/input";
import { Plus, ShieldAlert } from "lucide-react";
import type { CreateVehicleInput, VehicleDetails } from "./types";

const VEHICLE_TYPES: VehicleDetails["vehicleType"][] = ["car", "van", "truck", "bike", "bus", "other"];
const FUEL_TYPES: VehicleDetails["fuelType"][] = ["petrol", "diesel", "electric", "hybrid", "cng"];

export interface AddVehicleFormProps {
  onSubmit: (input: CreateVehicleInput) => Promise<void>;
}

export function AddVehicleForm({ onSubmit }: AddVehicleFormProps) {
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleDetails["vehicleType"]>("car");
  const [fuelType, setFuelType] = useState<VehicleDetails["fuelType"]>("petrol");
  const [showMore, setShowMore] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [year, setYear] = useState("");
  const [vin, setVin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!plateNumber.trim()) {
      setError("Plate number is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        plateNumber: plateNumber.trim(),
        vehicleType,
        fuelType,
        make: make.trim() || null,
        model: model.trim() || null,
        color: color.trim() || null,
        year: year.trim() || null,
        vin: vin.trim() || null,
      });
      setPlateNumber("");
      setMake("");
      setModel("");
      setColor("");
      setYear("");
      setVin("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add vehicle");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-cyan-400" />
        Add vehicle
      </h3>
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Plate number</label>
        <Input
          aria-label="Plate number"
          value={plateNumber}
          onChange={(e) => setPlateNumber(e.target.value)}
          placeholder="e.g. TN-09-AB-1234"
          className="h-8 text-xs bg-background/50 border-border"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Type</label>
          <select
            aria-label="Vehicle type"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as VehicleDetails["vehicleType"])}
            className="w-full h-8 px-2 rounded-md bg-background/50 border border-border text-xs text-foreground"
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fuel</label>
          <select
            aria-label="Fuel type"
            value={fuelType}
            onChange={(e) => setFuelType(e.target.value as VehicleDetails["fuelType"])}
            className="w-full h-8 px-2 rounded-md bg-background/50 border border-border text-xs text-foreground"
          >
            {FUEL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="text-xs font-semibold text-cyan-400 hover:underline"
      >
        {showMore ? "Hide more details" : "More details (optional)"}
      </button>

      {showMore && (
        <div className="grid grid-cols-2 gap-3">
          <Input aria-label="Make" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Make" className="h-8 text-xs bg-background/50 border-border" />
          <Input aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" className="h-8 text-xs bg-background/50 border-border" />
          <Input aria-label="Color" value={color} onChange={(e) => setColor(e.target.value)} placeholder="Color" className="h-8 text-xs bg-background/50 border-border" />
          <Input aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" className="h-8 text-xs bg-background/50 border-border" />
          <Input aria-label="VIN" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="VIN" className="h-8 text-xs bg-background/50 border-border col-span-2" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button type="submit" disabled={submitting || !plateNumber.trim()} style={{ width: "100%", padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}>
        {submitting ? "Adding…" : "Add vehicle"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Write `VehiclesPanel.tsx`**

Create `apps/web/components/fleet/VehiclesPanel.tsx`:

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Spinner } from "@gamopls/ui";
import * as fleetApi from "./api";
import { AddVehicleForm } from "./AddVehicleForm";
import { VehiclesTable } from "./VehiclesTable";
import type { Asset, CreateVehicleInput } from "./types";

export function VehiclesPanel() {
  const [vehicles, setVehicles] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fleetApi.listVehicles();
      setVehicles(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(input: CreateVehicleInput) {
    await fleetApi.createVehicle(input);
    await load();
  }

  return (
    <div className="space-y-8">
      <Card className="border border-border bg-card/40 p-6 backdrop-blur-sm">
        <AddVehicleForm onSubmit={handleCreate} />
      </Card>

      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-white mb-4 border-b border-border/50 pb-2">Vehicles</h2>
        {loading && vehicles.length === 0 ? (
          <div className="flex justify-center py-8">
            <Spinner size={24} label="Loading vehicles" />
          </div>
        ) : error && vehicles.length === 0 ? (
          <p role="alert" className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-4 rounded-lg">
            {error}
          </p>
        ) : (
          <VehiclesTable vehicles={vehicles} />
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter web test -- VehiclesPanel`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/fleet
git commit -m "feat(web): add Vehicles panel (list + add-vehicle form)"
```

---

### Task 12: `apps/web` — Drivers list + Add Driver form + assignment control

**Files:**
- Create: `apps/web/components/fleet/DriversPanel.tsx`
- Create: `apps/web/components/fleet/AddDriverForm.tsx`
- Create: `apps/web/components/fleet/DriversTable.tsx`
- Test: `apps/web/components/fleet/__tests__/DriversPanel.test.tsx`

**Interfaces:**
- Consumes: `listDrivers`, `createDriver`, `listVehicles`, `assignDriver`, `Driver`, `Asset` from Task 10.
- Produces: `<DriversPanel />`, consumed by Task 14's `app/fleet/page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/fleet/__tests__/DriversPanel.test.tsx`:

```typescript
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DriversPanel } from "../DriversPanel";
import * as fleetApi from "../api";

vi.mock("../api");

const baseAsset = {
  id: "asset-1",
  org_id: "org-1",
  fleet_id: "fleet-1",
  type: "vehicle",
  display_label: "TN-01-AB-1234 (van)",
  health_score: 91,
  telemetry: {},
  telemetry_updated_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  vehicleDetails: null,
};

describe("DriversPanel", () => {
  it("loads and displays drivers, and assigns a driver to a vehicle", async () => {
    vi.mocked(fleetApi.listDrivers).mockResolvedValue([
      {
        id: "driver-1",
        org_id: "org-1",
        fleet_id: "fleet-1",
        name: "Kumar S",
        phone: null,
        license_number: null,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([baseAsset]);
    vi.mocked(fleetApi.assignDriver).mockResolvedValue({} as any);

    render(<DriversPanel />);

    await waitFor(() => expect(screen.getByText("Kumar S")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Assign Kumar S to vehicle"), { target: { value: "asset-1" } });

    await waitFor(() => expect(fleetApi.assignDriver).toHaveBeenCalledWith("asset-1", "driver-1"));
  });

  it("submits the add-driver form with only a name", async () => {
    vi.mocked(fleetApi.listDrivers).mockResolvedValue([]);
    vi.mocked(fleetApi.listVehicles).mockResolvedValue([]);
    vi.mocked(fleetApi.createDriver).mockResolvedValue({} as any);

    render(<DriversPanel />);
    await waitFor(() => expect(fleetApi.listDrivers).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Driver name"), { target: { value: "Priya R" } });
    fireEvent.click(screen.getByRole("button", { name: /add driver/i }));

    await waitFor(() => expect(fleetApi.createDriver).toHaveBeenCalledWith(expect.objectContaining({ name: "Priya R" })));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- DriversPanel`
Expected: FAIL — `Cannot find module '../DriversPanel'`.

- [ ] **Step 3: Write `AddDriverForm.tsx`**

Create `apps/web/components/fleet/AddDriverForm.tsx`:

```typescript
"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@gamopls/ui";
import { Input } from "../ui/input";
import { Plus, ShieldAlert } from "lucide-react";
import type { CreateDriverInput } from "./types";

export interface AddDriverFormProps {
  onSubmit: (input: CreateDriverInput) => Promise<void>;
}

export function AddDriverForm({ onSubmit }: AddDriverFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [license, setLicense] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        phone: phone.trim() || null,
        license_number: license.trim() || null,
      });
      setName("");
      setPhone("");
      setLicense("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add driver");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-cyan-400" />
        Add driver
      </h3>
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Name</label>
        <Input aria-label="Driver name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kumar S" className="h-8 text-xs bg-background/50 border-border" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input aria-label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" className="h-8 text-xs bg-background/50 border-border" />
        <Input aria-label="License number" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="License (optional)" className="h-8 text-xs bg-background/50 border-border" />
      </div>
      {error && (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button type="submit" disabled={submitting || !name.trim()} style={{ width: "100%", padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}>
        {submitting ? "Adding…" : "Add driver"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Write `DriversTable.tsx`**

Create `apps/web/components/fleet/DriversTable.tsx`:

```typescript
"use client";

import { Badge } from "@gamopls/ui";
import type { Asset, Driver } from "./types";

export interface DriversTableProps {
  drivers: Driver[];
  vehicles: Asset[];
  onAssign: (driverId: string, assetId: string) => void;
}

export function DriversTable({ drivers, vehicles, onAssign }: DriversTableProps) {
  if (drivers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg">
        No drivers yet — add one above.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
          <th className="py-2">Driver</th>
          <th className="py-2">Status</th>
          <th className="py-2">Assign to vehicle</th>
        </tr>
      </thead>
      <tbody>
        {drivers.map((d) => (
          <tr key={d.id} className="border-b border-border/50">
            <td className="py-2 font-semibold text-foreground">{d.name}</td>
            <td className="py-2">
              <Badge tone={d.status === "active" ? "success" : "neutral"}>{d.status}</Badge>
            </td>
            <td className="py-2">
              <select
                aria-label={`Assign ${d.name} to vehicle`}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) onAssign(d.id, e.target.value);
                }}
                className="h-8 px-2 rounded-md bg-background/50 border border-border text-xs text-foreground"
              >
                <option value="" disabled>
                  Select vehicle…
                </option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.display_label}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Write `DriversPanel.tsx`**

Create `apps/web/components/fleet/DriversPanel.tsx`:

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Spinner } from "@gamopls/ui";
import * as fleetApi from "./api";
import { AddDriverForm } from "./AddDriverForm";
import { DriversTable } from "./DriversTable";
import type { Asset, CreateDriverInput, Driver } from "./types";

export function DriversPanel() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [driversData, vehiclesData] = await Promise.all([fleetApi.listDrivers(), fleetApi.listVehicles()]);
      setDrivers(driversData);
      setVehicles(vehiclesData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drivers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(input: CreateDriverInput) {
    await fleetApi.createDriver(input);
    await load();
  }

  async function handleAssign(driverId: string, assetId: string) {
    await fleetApi.assignDriver(assetId, driverId);
    await load();
  }

  return (
    <div className="space-y-8">
      <Card className="border border-border bg-card/40 p-6 backdrop-blur-sm">
        <AddDriverForm onSubmit={handleCreate} />
      </Card>

      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-white mb-4 border-b border-border/50 pb-2">Drivers</h2>
        {loading && drivers.length === 0 ? (
          <div className="flex justify-center py-8">
            <Spinner size={24} label="Loading drivers" />
          </div>
        ) : error && drivers.length === 0 ? (
          <p role="alert" className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-4 rounded-lg">
            {error}
          </p>
        ) : (
          <DriversTable drivers={drivers} vehicles={vehicles} onAssign={handleAssign} />
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter web test -- DriversPanel`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/fleet
git commit -m "feat(web): add Drivers panel (list + add-driver form + assignment)"
```

---

### Task 13: `apps/web` — Fleet page, nav link, fleet switcher

**Files:**
- Create: `apps/web/app/fleet/page.tsx`
- Create: `apps/web/components/fleet/FleetSwitcher.tsx`
- Modify: `apps/web/app/layout.tsx` (add nav link, replace static fleet badge with `<FleetSwitcher />`)
- Test: `apps/web/components/fleet/__tests__/FleetSwitcher.test.tsx`

**Interfaces:**
- Consumes: `listFleets` (Task 10), `VehiclesPanel`/`DriversPanel` (Tasks 11-12), `Fleet` type.
- Produces: `/fleet` route with tabbed Vehicles/Drivers panels; sidebar nav entry; working fleet switcher.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/fleet/__tests__/FleetSwitcher.test.tsx`:

```typescript
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { FleetSwitcher } from "../FleetSwitcher";
import * as fleetApi from "../api";

vi.mock("../api");

describe("FleetSwitcher", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal("location", { reload: vi.fn() } as any);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("lists fleets and switches on selection", async () => {
    vi.mocked(fleetApi.listFleets).mockResolvedValue([
      { id: "fleet-1", org_id: "org-1", name: "North Fleet", created_at: "", updated_at: "" },
      { id: "fleet-2", org_id: "org-1", name: "South Fleet", created_at: "", updated_at: "" },
    ]);

    render(<FleetSwitcher currentFleetId="fleet-1" />);

    await waitFor(() => expect(screen.getByText("North Fleet")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Active fleet"), { target: { value: "fleet-2" } });

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/switch-fleet",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- FleetSwitcher`
Expected: FAIL — `Cannot find module '../FleetSwitcher'`.

- [ ] **Step 3: Write `FleetSwitcher.tsx`**

Create `apps/web/components/fleet/FleetSwitcher.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import * as fleetApi from "./api";
import type { Fleet } from "./types";

export interface FleetSwitcherProps {
  currentFleetId: string;
}

export function FleetSwitcher({ currentFleetId }: FleetSwitcherProps) {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    void fleetApi.listFleets().then(setFleets).catch(() => setFleets([]));
  }, []);

  async function handleChange(fleetId: string) {
    if (fleetId === currentFleetId) return;
    setSwitching(true);
    await fetch("/api/switch-fleet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fleet_id: fleetId }),
    });
    window.location.reload();
  }

  if (fleets.length === 0) {
    return <span className="text-xs text-muted-foreground">fleet: {currentFleetId}</span>;
  }

  return (
    <select
      aria-label="Active fleet"
      value={currentFleetId}
      disabled={switching}
      onChange={(e) => void handleChange(e.target.value)}
      className="h-7 px-2 rounded-full bg-cyan-400/10 border border-cyan-400/20 text-xs font-medium text-cyan-400"
    >
      {fleets.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- FleetSwitcher`
Expected: PASS, 1 test.

- [ ] **Step 5: Write `app/fleet/page.tsx`**

Create `apps/web/app/fleet/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { VehiclesPanel } from "@/components/fleet/VehiclesPanel";
import { DriversPanel } from "@/components/fleet/DriversPanel";

type Tab = "vehicles" | "drivers";

export default function FleetPage() {
  const [tab, setTab] = useState<Tab>("vehicles");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Fleet</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage vehicles, drivers, and assignments.</p>
      </div>
      <div className="flex gap-2 border-b border-border">
        {(["vehicles", "drivers"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 transition-colors ${
              tab === t ? "border-cyan-400 text-white" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "vehicles" ? <VehiclesPanel /> : <DriversPanel />}
    </div>
  );
}
```

- [ ] **Step 6: Wire the nav link and fleet switcher into `app/layout.tsx`**

In `apps/web/app/layout.tsx`, add `Truck` to the `lucide-react` import and a new entry to `NAV_LINKS`:

```typescript
import { Globe, MessageSquare, ClipboardList, Files, Truck, Zap, LogOut } from "lucide-react";
```

```typescript
const NAV_LINKS = [
  { href: "/fleet", label: "Fleet", icon: Truck },
  { href: "/map", label: "Map", icon: Globe },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/board", label: "Board", icon: ClipboardList },
  { href: "/hub", label: "Hub", icon: Files },
];
```

Replace the static fleet badge in the header:

```typescript
<span className="inline-flex items-center rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-xs font-medium text-cyan-400 border border-cyan-400/20">fleet: {session.fleet_id}</span>
```

with:

```typescript
<FleetSwitcher currentFleetId={session.fleet_id} />
```

Add the import at the top of `app/layout.tsx`:

```typescript
import { FleetSwitcher } from "@/components/fleet/FleetSwitcher";
```

- [ ] **Step 7: Run the full `apps/web` test suite**

Run: `pnpm --filter web test`
Expected: all tests PASS, including the pre-existing Map/Chat/Board/Hub suites (no regressions) and the new fleet component tests.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/fleet apps/web/components/fleet apps/web/app/layout.tsx
git commit -m "feat(web): add Fleet page with Vehicles/Drivers tabs, nav link, and fleet switcher"
```

---

## Post-plan verification

After all 13 tasks are complete, run the full monorepo check before considering sub-project A done:

```bash
pnpm build && pnpm lint && pnpm test
```

Then manually smoke-test the flow per this repo's UI-testing convention: `pnpm start:all`, log in, click "Fleet" in the sidebar, add a vehicle with just plate+type+fuel, add a driver with just a name, assign the driver to the vehicle, confirm the assignment shows in `GET /api/fleet/assets/:id/assignments`, switch fleets via the sidebar dropdown and confirm the vehicle/driver lists change.
