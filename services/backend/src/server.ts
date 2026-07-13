import Fastify from "fastify";
import { Redis as IoRedis } from "ioredis";
import { Redis as UpstashRedis } from "@upstash/redis";
import { NatsEventBus } from "@gamopls/event-bus-nats";
import { ASSET_LOCATION_UPDATED, assetLocationUpdatedSchema } from "@gamopls/event-schemas";
import { getPrismaClient } from "@gamopls/db";

import {
  registerMapRoutes,
  MapService,
  InMemoryPositionCache,
  RedisPositionCache,
  UpstashPositionCache,
  type PositionCache,
} from "@gamopls/map";
import {
  registerChatRoutes,
  AlertBridge,
  InMemoryChannelRepository,
  InMemoryMessageRepository,
  PrismaChannelRepository,
  PrismaMessageRepository,
  type ChannelRepository,
  type MessageRepository,
} from "@gamopls/chat";
import {
  registerBoardRoutes,
  InMemoryBoardRepository,
  PrismaBoardRepository,
  subscribeTaskSuggested,
  type BoardRepository,
} from "@gamopls/board";
import {
  registerHubRoutes,
  InMemoryDocumentRepository,
  PrismaDocumentRepository,
  LocalDiskStorageProvider,
  KeywordSearchProvider,
  type DocumentRepository,
} from "@gamopls/hub";
import {
  registerFleetRoutes,
  InMemoryFleetRepository,
  PrismaFleetRepository,
  InMemoryDriverRepository,
  PrismaDriverRepository,
  InMemoryAssetRepository,
  PrismaAssetRepository,
  InMemoryAssignmentRepository,
  PrismaAssignmentRepository,
  InMemoryMaintenanceSuggestionRepository,
  PrismaMaintenanceSuggestionRepository,
  VehiclePluginClient,
  subscribeAssetHealthChanged,
  type FleetRepository,
  type DriverRepository,
  type AssetRepository,
  type AssignmentRepository,
} from "@gamopls/fleet";
import { registerRegistryRoutes, RegistryStore, PrismaRegistryStore, type IRegistryStore } from "@gamopls/registry";

/**
 * The composition root for GAMOPLS TeamCore's single V1 backend deployable.
 * Mounts map/chat/board/hub/fleet/registry's routes on ONE Fastify instance
 * under /map, /chat, /board, /hub, /fleet, /registry, in dev and in
 * production alike. Each block below mirrors what that service's own
 * (still-present) `server.ts` does — same env vars, same Prisma/Redis/NATS
 * fallbacks — this file only changes how many processes/ports are
 * involved, not the routes, auth, or tenancy logic, which all still live
 * in the owning service's `build-app.ts`.
 *
 * What this does NOT change: these modules still never call each other
 * directly — only via the NATS event bus — and still never import a
 * concrete Asset Type Plugin (`plugins/asset-vehicle` stays a separate
 * deployable, registered with CORE — `/registry`, mounted below — over
 * HTTP; `services/fleet` is the one module allowed to *call* it, over HTTP
 * via `VehiclePluginClient`, never by importing it). Collapsing these six
 * into one process is a deployment-topology decision, not a license to
 * couple their internals; `pnpm check:architecture` still enforces that.
 * See docs/architecture/GAMOPLS_TeamCore_Platform_Architecture.md and
 * CLAUDE.md's "Deployment topology (V1)" section for the fuller rationale.
 */

const databaseUrl = process.env.DATABASE_URL;
const natsServers = process.env.NATS_URL ?? process.env.NATS_SERVERS ?? "nats://localhost:4222";

async function buildMapSection() {
  let cache: PositionCache;
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const redisUrl = process.env.REDIS_URL;

  if (upstashUrl && upstashToken) {
    console.log("backend/map: using cloud-hosted Upstash Redis via REST");
    cache = new UpstashPositionCache(new UpstashRedis({ url: upstashUrl, token: upstashToken }));
  } else if (redisUrl) {
    console.log(`backend/map: using classic TCP Redis at ${redisUrl}`);
    cache = new RedisPositionCache(new IoRedis(redisUrl));
  } else {
    console.warn("backend/map: no Redis configured, falling back to in-memory position cache.");
    cache = new InMemoryPositionCache();
  }

  const eventBus = new NatsEventBus({ servers: natsServers, name: "gamopls-backend-map" });
  await eventBus.connect();

  const mapService = new MapService(cache, eventBus);
  await eventBus.subscribe(ASSET_LOCATION_UPDATED, async (payload: unknown) => {
    const parsed = assetLocationUpdatedSchema.safeParse(payload);
    if (!parsed.success) {
      console.error("backend/map: dropping malformed AssetLocationUpdated event", parsed.error.flatten());
      return;
    }
    await mapService.handleLocationUpdate(parsed.data);
  });

  return mapService;
}

function buildChatSection(): { channels: ChannelRepository; messages: MessageRepository } {
  if (databaseUrl) {
    console.log("backend/chat: using Neon Postgres database via Prisma");
    const prisma = getPrismaClient();
    return { channels: new PrismaChannelRepository(prisma), messages: new PrismaMessageRepository(prisma) };
  }
  console.warn("backend/chat: DATABASE_URL not set — running with an in-memory (non-persistent) store.");
  return { channels: new InMemoryChannelRepository(), messages: new InMemoryMessageRepository() };
}

function buildBoardSection(): BoardRepository {
  if (databaseUrl) {
    console.log("backend/board: using Neon Postgres database via Prisma");
    return new PrismaBoardRepository(getPrismaClient());
  }
  console.warn("backend/board: DATABASE_URL not set — running with an in-memory (non-persistent) store.");
  return new InMemoryBoardRepository();
}

function buildHubSection(): DocumentRepository {
  if (databaseUrl) {
    console.log("backend/hub: using Neon Postgres database via Prisma");
    return new PrismaDocumentRepository(getPrismaClient());
  }
  console.warn("backend/hub: DATABASE_URL not set — running with an in-memory (non-persistent) store.");
  return new InMemoryDocumentRepository();
}

function buildFleetSection(): {
  fleetRepo: FleetRepository;
  driverRepo: DriverRepository;
  assetRepo: AssetRepository;
  assignmentRepo: AssignmentRepository;
  vehiclePluginClient: VehiclePluginClient;
} {
  const vehiclePluginClient = new VehiclePluginClient({
    baseUrl: process.env.VEHICLE_PLUGIN_URL ?? "http://localhost:4700",
  });

  if (databaseUrl) {
    console.log("backend/fleet: using Neon Postgres database via Prisma");
    const prisma = getPrismaClient();
    return {
      fleetRepo: new PrismaFleetRepository(prisma),
      driverRepo: new PrismaDriverRepository(prisma),
      assetRepo: new PrismaAssetRepository(prisma),
      assignmentRepo: new PrismaAssignmentRepository(prisma),
      vehiclePluginClient,
    };
  }
  console.warn("backend/fleet: DATABASE_URL not set — running with in-memory (non-persistent) stores.");
  return {
    fleetRepo: new InMemoryFleetRepository(),
    driverRepo: new InMemoryDriverRepository(),
    assetRepo: new InMemoryAssetRepository(),
    assignmentRepo: new InMemoryAssignmentRepository(),
    vehiclePluginClient,
  };
}

function buildRegistrySection(): IRegistryStore {
  if (databaseUrl) {
    console.log("backend/registry: using Neon Postgres database via Prisma");
    return new PrismaRegistryStore(getPrismaClient());
  }
  console.warn("backend/registry: DATABASE_URL not set — running with an in-memory (non-persistent) store.");
  return new RegistryStore();
}

async function main() {
  const app = Fastify({ logger: true });
  const port = Number(process.env.PORT ?? process.env.BACKEND_PORT ?? 4300);
  const host = process.env.HOST ?? "127.0.0.1";

  // ---- map ----
  const mapService = await buildMapSection();
  await app.register(async (scoped) => {
    await registerMapRoutes(scoped, mapService);
  }, { prefix: "/map" });

  // ---- chat ----
  const { channels, messages } = buildChatSection();
  await app.register(async (scoped) => {
    registerChatRoutes(scoped, { channels, messages });
  }, { prefix: "/chat" });

  const chatEventBus = new NatsEventBus({ servers: natsServers, name: "gamopls-backend-chat" });
  const alertBridge = new AlertBridge(chatEventBus, channels, messages);
  try {
    await chatEventBus.connect();
    await alertBridge.start();
    console.log(`backend/chat: subscribed to AlertRaised via NATS at ${natsServers}`);
  } catch (err) {
    console.error("backend/chat: failed to connect to NATS, continuing without the AlertRaised bridge:", err);
  }

  // ---- board ----
  // registryUrl points at CORE's plugin registry — mounted below at
  // /registry in this same process — via a normal HTTP loopback call, not
  // a direct import; board still only knows the registry as an HTTP peer.
  const boardRepo = buildBoardSection();
  const registryUrl = process.env.REGISTRY_URL ?? `http://${host}:${port}/registry`;
  await app.register(async (scoped) => {
    registerBoardRoutes(scoped, { repo: boardRepo, registryUrl });
  }, { prefix: "/board" });

  const boardEventBus = new NatsEventBus({ servers: natsServers, name: "gamopls-backend-board" });
  try {
    await boardEventBus.connect();
    await subscribeTaskSuggested(boardEventBus, boardRepo, (task) => {
      app.log.info(`backend/board: created draft task ${task.id} from TaskSuggested`);
    });
    console.log(`backend/board: subscribed to TaskSuggested via NATS at ${natsServers}`);
  } catch (err) {
    console.warn(`backend/board: could not connect to NATS at ${natsServers}, TaskSuggested subscription disabled: ${err}`);
  }

  // ---- hub ----
  const hubRepository = buildHubSection();
  const storage = new LocalDiskStorageProvider(process.env.HUB_STORAGE_DIR ?? "./data/hub-documents");
  const searchProvider = new KeywordSearchProvider(hubRepository);
  await app.register(async (scoped) => {
    registerHubRoutes(scoped, { repository: hubRepository, storage, searchProvider });
  }, { prefix: "/hub" });

  // ---- registry (CORE plugin registry) ----
  const registryStore = buildRegistrySection();
  await app.register(async (scoped) => {
    registerRegistryRoutes(scoped, { store: registryStore });
  }, { prefix: "/registry" });

  // ---- fleet ----
  const { fleetRepo, driverRepo, assetRepo, assignmentRepo, vehiclePluginClient } = buildFleetSection();
  await app.register(async (scoped) => {
    registerFleetRoutes(scoped, { fleetRepo, driverRepo, assetRepo, assignmentRepo, vehiclePluginClient });
  }, { prefix: "/fleet" });

  const fleetEventBus = new NatsEventBus({ servers: natsServers, name: "gamopls-backend-fleet" });
  try {
    await fleetEventBus.connect();
    const suggestionRepo = databaseUrl
      ? new PrismaMaintenanceSuggestionRepository(getPrismaClient())
      : new InMemoryMaintenanceSuggestionRepository();
    await subscribeAssetHealthChanged(fleetEventBus, assetRepo, {
      vehiclePluginClient,
      suggestionRepo,
      publisher: fleetEventBus,
    });
    console.log(`backend/fleet: subscribed to AssetHealthChanged via NATS at ${natsServers}`);
  } catch (err) {
    console.warn(`backend/fleet: could not connect to NATS at ${natsServers}, AssetHealthChanged subscription disabled: ${err}`);
  }

  await app.listen({ port, host });
  app.log.info(
    `backend listening on http://${host}:${port} (routes under /map, /chat, /board, /hub, /fleet, /registry)`,
  );
}

main().catch((err) => {
  console.error("backend failed to start:", err);
  process.exit(1);
});
