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
import { InMemoryMaintenanceSuggestionRepository } from "./in-memory-maintenance-suggestion-repository.js";
import { PrismaMaintenanceSuggestionRepository } from "./prisma-maintenance-suggestion-repository.js";
import type { MaintenanceSuggestionRepository } from "./maintenance-suggestion-repository.js";

const port = Number(process.env.PORT ?? 4600);
const host = process.env.HOST ?? "0.0.0.0";
const natsServers = process.env.NATS_URL ?? "nats://localhost:4222";
const databaseUrl = process.env.DATABASE_URL;
const vehiclePluginUrl = process.env.VEHICLE_PLUGIN_URL ?? "http://localhost:4700";

let fleetRepo: FleetRepository;
let driverRepo: DriverRepository;
let assetRepo: AssetRepository;
let assignmentRepo: AssignmentRepository;
let suggestionRepo: MaintenanceSuggestionRepository;

if (databaseUrl) {
  console.log("fleet: using Neon Postgres database via Prisma");
  const prisma = getPrismaClient();
  fleetRepo = new PrismaFleetRepository(prisma);
  driverRepo = new PrismaDriverRepository(prisma);
  assetRepo = new PrismaAssetRepository(prisma);
  assignmentRepo = new PrismaAssignmentRepository(prisma);
  suggestionRepo = new PrismaMaintenanceSuggestionRepository(prisma);
} else {
  console.warn("fleet: DATABASE_URL not set — running with in-memory (non-persistent) stores.");
  fleetRepo = new InMemoryFleetRepository();
  driverRepo = new InMemoryDriverRepository();
  assetRepo = new InMemoryAssetRepository();
  assignmentRepo = new InMemoryAssignmentRepository();
  suggestionRepo = new InMemoryMaintenanceSuggestionRepository();
}

const vehiclePluginClient = new VehiclePluginClient({ baseUrl: vehiclePluginUrl });
const app = buildApp({ fleetRepo, driverRepo, assetRepo, assignmentRepo, vehiclePluginClient });

async function main() {
  try {
    const bus = new NatsEventBus({ servers: natsServers, name: "fleet" });
    await bus.connect();
    await subscribeAssetHealthChanged(bus, assetRepo, { vehiclePluginClient, suggestionRepo, publisher: bus });
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
