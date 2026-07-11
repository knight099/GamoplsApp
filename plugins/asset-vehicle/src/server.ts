import { buildApp } from "./build-app.js";
import { InMemoryVehicleDetailsRepository } from "./in-memory-vehicle-details-repository.js";
import { PrismaVehicleDetailsRepository } from "./prisma-vehicle-details-repository.js";
import { getPrismaClient } from "@gamopls/db";
import type { VehicleDetailsRepository } from "./vehicle-details-repository.js";
import { InMemoryMaintenanceRecordRepository } from "./in-memory-maintenance-record-repository.js";
import { PrismaMaintenanceRecordRepository } from "./prisma-maintenance-record-repository.js";
import type { MaintenanceRecordRepository } from "./maintenance-record-repository.js";

const port = Number(process.env.PORT ?? 4700);
const host = process.env.HOST ?? "127.0.0.1";
const databaseUrl = process.env.DATABASE_URL;

let repo: VehicleDetailsRepository;
if (databaseUrl) {
  console.log("asset-vehicle: using Neon Postgres database via Prisma");
  repo = new PrismaVehicleDetailsRepository(getPrismaClient());
} else {
  console.warn("asset-vehicle: DATABASE_URL not set — running with an in-memory (non-persistent) store.");
  repo = new InMemoryVehicleDetailsRepository();
}

let maintenanceRepo: MaintenanceRecordRepository;
if (databaseUrl) {
  maintenanceRepo = new PrismaMaintenanceRecordRepository(getPrismaClient());
} else {
  maintenanceRepo = new InMemoryMaintenanceRecordRepository();
}

const app = buildApp({ repo, maintenanceRepo });

app
  .listen({ port, host })
  .then(() => {
    app.log.info(`asset-vehicle listening on http://${host}:${port}`);
  })
  .catch((err) => {
    console.error("asset-vehicle failed to start:", err);
    process.exit(1);
  });
