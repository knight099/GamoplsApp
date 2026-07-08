import { Redis } from "@upstash/redis";
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
 * PositionCache adapter using Upstash Redis REST client.
 * Suitable for cloud/serverless environments (Neon/Upstash).
 */
export class UpstashPositionCache implements PositionCache {
  constructor(private readonly redis: Redis) {}

  async set(snapshot: AssetPositionSnapshot): Promise<void> {
    const p = this.redis.pipeline();
    // Upstash handles object serialization automatically when passed directly
    p.set(positionKey(snapshot.id), snapshot);
    p.sadd(fleetIndexKey(snapshot.fleet_id), snapshot.id);
    await p.exec();
  }

  async get(assetId: string): Promise<AssetPositionSnapshot | null> {
    // Upstash automatically parses JSON strings back into objects
    const data = await this.redis.get<AssetPositionSnapshot>(positionKey(assetId));
    return data || null;
  }

  async listByFleet(fleetId: string): Promise<AssetPositionSnapshot[]> {
    const assetIds = await this.redis.smembers(fleetIndexKey(fleetId));
    if (assetIds.length === 0) return [];

    const keys = assetIds.map(positionKey);
    const results = await this.redis.mget<AssetPositionSnapshot[]>(...keys);
    
    return results.filter((r): r is AssetPositionSnapshot => r !== null);
  }

  async clear(): Promise<void> {
    // Clean up keys starting with prefix
    const keys = await this.redis.keys(`${KEY_PREFIX}*`);
    const fleetKeys = await this.redis.keys(`${FLEET_INDEX_PREFIX}*`);
    const all = [...keys, ...fleetKeys];
    if (all.length > 0) {
      await this.redis.del(...all);
    }
  }
}
