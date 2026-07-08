import type { AssetPositionSnapshot } from "../marker/asset-marker.js";

/**
 * Repository interface for the live position cache. Redis is the intended
 * production backend (`RedisPositionCache`), but all business logic in
 * this service (geofence detection, WS streaming, REST reads) is coded
 * against this interface — never against `ioredis` directly — so:
 *   1. Redis stays isolated to `redis-position-cache.ts`, and
 *   2. unit tests can run against `InMemoryPositionCache` without a live
 *      Redis instance.
 */
export interface PositionCache {
  /** Upsert the latest known position/identity snapshot for an asset. */
  set(snapshot: AssetPositionSnapshot): Promise<void>;

  /** Fetch the latest snapshot for a single asset, or null if unknown. */
  get(assetId: string): Promise<AssetPositionSnapshot | null>;

  /** List all cached snapshots for a given fleet (tenant-scoped read). */
  listByFleet(fleetId: string): Promise<AssetPositionSnapshot[]>;

  /** Remove all cached state. Primarily for test cleanup. */
  clear(): Promise<void>;
}
