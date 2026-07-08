import { describe, expect, it } from "vitest";
import { InMemoryPositionCache } from "../cache/in-memory-position-cache.js";
import type { AssetPositionSnapshot } from "../marker/asset-marker.js";

function snapshot(overrides: Partial<AssetPositionSnapshot> = {}): AssetPositionSnapshot {
  return {
    id: "asset-1",
    org_id: "org-1",
    fleet_id: "fleet-1",
    type: "vehicle",
    pluginMetadata: {},
    mapIcon: "vehicle-icon",
    displayLabel: "Truck 1",
    lat: 12.9,
    lng: 80.2,
    heading: 90,
    speed: 10,
    positionUpdatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("InMemoryPositionCache", () => {
  it("round-trips a set snapshot via get", async () => {
    const cache = new InMemoryPositionCache();
    const snap = snapshot();
    await cache.set(snap);

    const result = await cache.get("asset-1");
    expect(result).toEqual(snap);
  });

  it("returns null for an unknown asset", async () => {
    const cache = new InMemoryPositionCache();
    expect(await cache.get("missing")).toBeNull();
  });

  it("lists only snapshots belonging to the requested fleet (tenant scoping)", async () => {
    const cache = new InMemoryPositionCache();
    await cache.set(snapshot({ id: "asset-1", fleet_id: "fleet-1" }));
    await cache.set(snapshot({ id: "asset-2", fleet_id: "fleet-1" }));
    await cache.set(snapshot({ id: "asset-3", fleet_id: "fleet-2" }));

    const fleet1 = await cache.listByFleet("fleet-1");
    expect(fleet1.map((s) => s.id).sort()).toEqual(["asset-1", "asset-2"]);

    const fleet2 = await cache.listByFleet("fleet-2");
    expect(fleet2.map((s) => s.id)).toEqual(["asset-3"]);
  });

  it("overwrites on repeated set for the same asset id", async () => {
    const cache = new InMemoryPositionCache();
    await cache.set(snapshot({ lat: 1, lng: 1 }));
    await cache.set(snapshot({ lat: 2, lng: 2 }));

    const result = await cache.get("asset-1");
    expect(result?.lat).toBe(2);
    expect(result?.lng).toBe(2);
  });

  it("clear() empties the cache", async () => {
    const cache = new InMemoryPositionCache();
    await cache.set(snapshot());
    await cache.clear();
    expect(await cache.get("asset-1")).toBeNull();
    expect(await cache.listByFleet("fleet-1")).toEqual([]);
  });
});
