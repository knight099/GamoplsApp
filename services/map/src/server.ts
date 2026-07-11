import { Redis as IoRedis } from "ioredis";
import { Redis as UpstashRedis } from "@upstash/redis";
import { NatsEventBus } from "@gamopls/event-bus-nats";
import { ASSET_LOCATION_UPDATED, assetLocationUpdatedSchema } from "@gamopls/event-schemas";
import { buildApp } from "./build-app.js";
import { RedisPositionCache } from "./cache/redis-position-cache.js";
import { UpstashPositionCache } from "./cache/upstash-position-cache.js";
import { InMemoryPositionCache } from "./cache/in-memory-position-cache.js";
import { MapService } from "./map-service.js";
import type { PositionCache } from "./cache/position-cache.js";

/**
 * Composition root: this is the only place the concrete NATS/Redis
 * adapters get instantiated and wired into `MapService`. Business logic
 * (`map-service.ts`, `build-app.ts`) only ever sees the `EventPublisher`/
 * `EventSubscriber`/`PositionCache` interfaces.
 */
async function main() {
  let cache: PositionCache;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const redisUrl = process.env.REDIS_URL;

  if (upstashUrl && upstashToken) {
    console.log("map: using cloud-hosted Upstash Redis via REST");
    const upstashRedis = new UpstashRedis({
      url: upstashUrl,
      token: upstashToken,
    });
    cache = new UpstashPositionCache(upstashRedis);
  } else if (redisUrl) {
    console.log(`map: using classic TCP Redis at ${redisUrl}`);
    const redis = new IoRedis(redisUrl);
    cache = new RedisPositionCache(redis);
  } else {
    console.warn("map: neither UPSTASH_REDIS_REST_URL nor REDIS_URL configured. Falling back to in-memory position cache.");
    cache = new InMemoryPositionCache();
  }

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
  const host = process.env.HOST ?? "127.0.0.1";

  await app.listen({ port, host });
  app.log.info(`map listening on http://${host}:${port}`);
}

main().catch((err) => {
  console.error("map failed to start:", err);
  process.exit(1);
});
