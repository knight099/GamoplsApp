import type { Redis } from "ioredis";
import type { AssetPositionSnapshot } from "../marker/asset-marker.js";
import type { PositionCache } from "./position-cache.js";

const KEY_PREFIX = "map:position:";
const FLEET_INDEX_PREFIX = "map:fleet-index:";

function positionKey(assetId: string): string {
  return `${KEY_PREFIX}${assetId}`;
}

function fleetIndexKey(fleetId: string): string {
  return `${FLEET_INDEX_PREFIX}${fleetId}`;
}

/**
 * The one module in this service allowed to import `ioredis`. Stores each
 * asset's latest position snapshot as a JSON string under
 * `map:position:<assetId>`, and maintains a per-fleet Redis Set of asset
 * ids (`map:fleet-index:<fleetId>`) so `listByFleet` doesn't require a
 * Redis `KEYS`/`SCAN` over the whole keyspace.
 */
export class RedisPositionCache implements PositionCache {
  constructor(private readonly redis: Redis) {}

  async set(snapshot: AssetPositionSnapshot): Promise<void> {
    await this.redis
      .multi()
      .set(positionKey(snapshot.id), JSON.stringify(snapshot))
      .sadd(fleetIndexKey(snapshot.fleet_id), snapshot.id)
      .exec();
  }

  async get(assetId: string): Promise<AssetPositionSnapshot | null> {
    const raw = await this.redis.get(positionKey(assetId));
    return raw ? (JSON.parse(raw) as AssetPositionSnapshot) : null;
  }

  async listByFleet(fleetId: string): Promise<AssetPositionSnapshot[]> {
    const assetIds = await this.redis.smembers(fleetIndexKey(fleetId));
    if (assetIds.length === 0) return [];

    const raws = await this.redis.mget(assetIds.map(positionKey));
    return raws
      .filter((raw): raw is string => raw !== null)
      .map((raw) => JSON.parse(raw) as AssetPositionSnapshot);
  }

  async clear(): Promise<void> {
    const keys = await this.redis.keys(`${KEY_PREFIX}*`);
    const fleetKeys = await this.redis.keys(`${FLEET_INDEX_PREFIX}*`);
    const all = [...keys, ...fleetKeys];
    if (all.length > 0) {
      await this.redis.del(...all);
    }
  }
}
