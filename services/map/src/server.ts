import { Redis } from "ioredis";
import { NatsEventBus } from "@gamopls/event-bus-nats";
import { ASSET_LOCATION_UPDATED, assetLocationUpdatedSchema } from "@gamopls/event-schemas";
import { buildApp } from "./build-app.js";
import { RedisPositionCache } from "./cache/redis-position-cache.js";
import { MapService } from "./map-service.js";

/**
 * Composition root: this is the only place the concrete NATS/Redis
 * adapters get instantiated and wired into `MapService`. Business logic
 * (`map-service.ts`, `build-app.ts`) only ever sees the `EventPublisher`/
 * `EventSubscriber`/`PositionCache` interfaces.
 */
async function main() {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const cache = new RedisPositionCache(redis);

  const eventBus = new NatsEventBus({ servers: process.env.NATS_URL ?? "nats://localhost:4222" });
  await eventBus.connect();

  const mapService = new MapService(cache, eventBus);

  await eventBus.subscribe(ASSET_LOCATION_UPDATED, async (payload: unknown) => {
    const parsed = assetLocationUpdatedSchema.safeParse(payload);
    if (!parsed.success) {
      console.error("map: dropping malformed AssetLocationUpdated event", parsed.error.flatten());
      return;
    }
    await mapService.handleLocationUpdate(parsed.data);
  });

  const app = await buildApp(mapService);
  const port = Number(process.env.PORT ?? 4401);
  const host = process.env.HOST ?? "0.0.0.0";

  await app.listen({ port, host });
  app.log.info(`map listening on http://${host}:${port}`);
}

main().catch((err) => {
  console.error("map failed to start:", err);
  process.exit(1);
});
