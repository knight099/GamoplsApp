import type { AssetPositionSnapshot } from "../marker/asset-marker.js";
import type { PositionCache } from "./position-cache.js";

/**
 * In-memory implementation of `PositionCache`. Used in unit tests (no live
 * Redis needed) and could stand in for `dev`/single-instance deployments,
 * but the production wiring in `server.ts` uses `RedisPositionCache`.
 */
export class InMemoryPositionCache implements PositionCache {
  private readonly snapshots = new Map<string, AssetPositionSnapshot>();

  async set(snapshot: AssetPositionSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, snapshot);
  }

  async get(assetId: string): Promise<AssetPositionSnapshot | null> {
    return this.snapshots.get(assetId) ?? null;
  }

  async listByFleet(fleetId: string): Promise<AssetPositionSnapshot[]> {
    return Array.from(this.snapshots.values()).filter((s) => s.fleet_id === fleetId);
  }

  async clear(): Promise<void> {
    this.snapshots.clear();
  }
}
