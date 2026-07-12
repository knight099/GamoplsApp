import { describe, expect, it, vi } from "vitest";
import { ASSET_HEALTH_CHANGED } from "@gamopls/event-schemas";
import { subscribeAssetHealthChanged } from "../health-subscription.js";
import { InMemoryAssetRepository } from "../in-memory-asset-repository.js";
import { InMemoryMaintenanceSuggestionRepository } from "../in-memory-maintenance-suggestion-repository.js";

class FakeVehiclePluginClientForHealth {
  constructor(
    private readonly maintenanceRecords: Record<string, { serviceType: string; odometerAtServiceKm: number }[]> = {},
    private readonly vehicleDetails: Record<string, { fuelCapacityLiters: number | null }> = {},
  ) {}
  async getMaintenanceRecords(assetId: string) {
    return (this.maintenanceRecords[assetId] ?? []).map((r) => ({
      id: "rec-1",
      assetId,
      performedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      ...r,
    }));
  }
  async getVehicleDetails(assetId: string) {
    const d = this.vehicleDetails[assetId];
    return d ? { assetId, fuelCapacityLiters: d.fuelCapacityLiters, plateNumber: "", vehicleType: "", fuelType: "", make: null, model: null, color: null, year: null, vin: null, odometerKm: 0 } : null;
  }
}

class FakePublisher {
  published: { subject: string; payload: unknown }[] = [];
  async publish(subject: string, payload: unknown) {
    this.published.push({ subject, payload });
  }
}

describe("subscribeAssetHealthChanged", () => {
  it("updates the asset's health score and telemetry on a valid event", async () => {
    const assetRepo = new InMemoryAssetRepository();
    const asset = await assetRepo.create({ org_id: "org-1", fleet_id: "fleet-1", type: "vehicle", display_label: "TN-01" });

    let handler: (payload: unknown) => Promise<void>;
    const fakeSubscriber = {
      subscribe: vi.fn(async (_subject: string, h: (payload: unknown) => Promise<void>) => {
        handler = h;
        return { unsubscribe: async () => {} };
      }),
    };

    await subscribeAssetHealthChanged(fakeSubscriber as any, assetRepo);
    expect(fakeSubscriber.subscribe).toHaveBeenCalledWith(ASSET_HEALTH_CHANGED, expect.any(Function));

    await handler!({
      type: ASSET_HEALTH_CHANGED,
      org_id: "org-1",
      fleet_id: "fleet-1",
      timestamp: new Date().toISOString(),
      asset_id: asset.id,
      healthScore: 82,
      telemetry: { fuel_pct: 54, battery_pct: 76, engine_temp_c: 91.2, odometer_km: 15234 },
    });

    const updated = await assetRepo.get(asset.id, "org-1", "fleet-1");
    expect(updated?.health_score).toBe(82);
    expect(updated?.telemetry).toEqual({ fuel_pct: 54, battery_pct: 76, engine_temp_c: 91.2, odometer_km: 15234 });
  });

  it("drops a malformed payload without throwing", async () => {
    const assetRepo = new InMemoryAssetRepository();
    let handler: (payload: unknown) => Promise<void>;
    const fakeSubscriber = {
      subscribe: vi.fn(async (_subject: string, h: (payload: unknown) => Promise<void>) => {
        handler = h;
        return { unsubscribe: async () => {} };
      }),
    };
    await subscribeAssetHealthChanged(fakeSubscriber as any, assetRepo);
    await expect(handler!({ garbage: true })).resolves.toBeUndefined();
  });

  it("drops an event whose processing throws (e.g. a repository rejecting an unknown/malformed asset_id) without killing the subscription", async () => {
    // Reproduces a live bug: a real Postgres-backed AssetRepository throws
    // when asset_id isn't a valid UUID (Asset.id is @db.Uuid) — e.g. a
    // simulator/device publishing readings for an asset that was never
    // onboarded. Previously this uncaught error propagated out of the
    // subscription callback and killed the ENTIRE NATS subscription for
    // the process's lifetime, silently stopping all future health
    // processing — not just for the one bad event.
    const assetRepo = {
      get: vi.fn().mockRejectedValue(new Error("Error creating UUID, invalid character")),
      updateHealth: vi.fn(),
      updateMileage: vi.fn(),
    };
    let handler: (payload: unknown) => Promise<void>;
    const fakeSubscriber = {
      subscribe: vi.fn(async (_subject: string, h: (payload: unknown) => Promise<void>) => {
        handler = h;
        return { unsubscribe: async () => {} };
      }),
    };
    await subscribeAssetHealthChanged(fakeSubscriber as any, assetRepo as any);

    await expect(
      handler!({
        type: ASSET_HEALTH_CHANGED,
        org_id: "org-1",
        fleet_id: "fleet-1",
        timestamp: new Date().toISOString(),
        asset_id: "vehicle-001", // not a valid UUID
        healthScore: 90,
        telemetry: { fuel_pct: 80 },
      }),
    ).resolves.toBeUndefined();

    // A subsequent, valid event on the SAME subscription must still work —
    // proving the subscription survived the earlier throw.
    assetRepo.get.mockResolvedValue(null);
    await handler!({
      type: ASSET_HEALTH_CHANGED,
      org_id: "org-1",
      fleet_id: "fleet-1",
      timestamp: new Date().toISOString(),
      asset_id: "8400f7e2-8e93-4b0a-9a2a-000000000001",
      healthScore: 77,
      telemetry: { fuel_pct: 60 },
    });
    expect(assetRepo.updateHealth).toHaveBeenCalledWith("8400f7e2-8e93-4b0a-9a2a-000000000001", 77, { fuel_pct: 60 });
  });
});

describe("subscribeAssetHealthChanged — service-due suggestions", () => {
  it("publishes TaskSuggested when odometer crosses a service interval with no prior record", async () => {
    const assetRepo = new InMemoryAssetRepository();
    const asset = await assetRepo.create({ org_id: "org-1", fleet_id: "fleet-1", type: "vehicle", display_label: "TN-01" });
    const suggestionRepo = new InMemoryMaintenanceSuggestionRepository();
    const vehiclePluginClient = new FakeVehiclePluginClientForHealth({}, {});
    const publisher = new FakePublisher();

    let handler: (payload: unknown) => Promise<void>;
    const fakeSubscriber = {
      subscribe: vi.fn(async (_subject: string, h: (payload: unknown) => Promise<void>) => {
        handler = h;
        return { unsubscribe: async () => {} };
      }),
    };

    await subscribeAssetHealthChanged(fakeSubscriber as any, assetRepo, {
      vehiclePluginClient: vehiclePluginClient as any,
      suggestionRepo,
      publisher: publisher as any,
    });

    await handler!({
      type: "AssetHealthChanged",
      org_id: "org-1",
      fleet_id: "fleet-1",
      timestamp: new Date().toISOString(),
      asset_id: asset.id,
      healthScore: 90,
      telemetry: { odometer_km: 12000 },
    });

    const suggested = publisher.published.find((p) => p.subject === "TaskSuggested");
    expect(suggested).toBeDefined();
    expect((suggested!.payload as any).title).toContain("oil_change");
  });

  it("does not re-suggest until another full interval passes", async () => {
    const assetRepo = new InMemoryAssetRepository();
    const asset = await assetRepo.create({ org_id: "org-1", fleet_id: "fleet-1", type: "vehicle", display_label: "TN-01" });
    const suggestionRepo = new InMemoryMaintenanceSuggestionRepository();
    await suggestionRepo.upsert("org-1", "fleet-1", asset.id, "oil_change", 12000);
    // tire_rotation shares the same 10000km interval as oil_change, and general_service's
    // 15000km interval is crossed by this test's 15000km event too — pre-register both so
    // this test isolates the "does not re-suggest oil_change early" behavior instead of
    // tripping on an unrelated service type crossing its own interval for the first time.
    await suggestionRepo.upsert("org-1", "fleet-1", asset.id, "tire_rotation", 12000);
    await suggestionRepo.upsert("org-1", "fleet-1", asset.id, "general_service", 12000);
    const vehiclePluginClient = new FakeVehiclePluginClientForHealth({}, {});
    const publisher = new FakePublisher();

    let handler: (payload: unknown) => Promise<void>;
    const fakeSubscriber = {
      subscribe: vi.fn(async (_subject: string, h: (payload: unknown) => Promise<void>) => {
        handler = h;
        return { unsubscribe: async () => {} };
      }),
    };
    await subscribeAssetHealthChanged(fakeSubscriber as any, assetRepo, {
      vehiclePluginClient: vehiclePluginClient as any,
      suggestionRepo,
      publisher: publisher as any,
    });

    await handler!({
      type: "AssetHealthChanged",
      org_id: "org-1",
      fleet_id: "fleet-1",
      timestamp: new Date().toISOString(),
      asset_id: asset.id,
      healthScore: 90,
      telemetry: { odometer_km: 15000 }, // still short of another +10000km from 12000
    });

    expect(publisher.published.find((p) => p.subject === "TaskSuggested")).toBeUndefined();
  });
});

describe("subscribeAssetHealthChanged — fuel efficiency", () => {
  it("computes mileage across a normal (non-refuel) delta", async () => {
    const assetRepo = new InMemoryAssetRepository();
    const asset = await assetRepo.create({ org_id: "org-1", fleet_id: "fleet-1", type: "vehicle", display_label: "TN-01" });
    await assetRepo.updateHealth(asset.id, 90, { fuel_pct: 80, odometer_km: 10000 });

    const vehiclePluginClient = new FakeVehiclePluginClientForHealth({}, { [asset.id]: { fuelCapacityLiters: 50 } });
    let handler: (payload: unknown) => Promise<void>;
    const fakeSubscriber = {
      subscribe: vi.fn(async (_subject: string, h: (payload: unknown) => Promise<void>) => {
        handler = h;
        return { unsubscribe: async () => {} };
      }),
    };
    await subscribeAssetHealthChanged(fakeSubscriber as any, assetRepo, {
      vehiclePluginClient: vehiclePluginClient as any,
      suggestionRepo: new InMemoryMaintenanceSuggestionRepository(),
      publisher: new FakePublisher() as any,
    });

    // 100km covered, fuel dropped from 80% to 70% of a 50L tank = 5L consumed -> 20 km/L
    await handler!({
      type: "AssetHealthChanged",
      org_id: "org-1",
      fleet_id: "fleet-1",
      timestamp: new Date().toISOString(),
      asset_id: asset.id,
      healthScore: 90,
      telemetry: { fuel_pct: 70, odometer_km: 10100 },
    });

    const updated = await assetRepo.get(asset.id, "org-1", "fleet-1");
    expect(updated?.last_mileage_kmpl).toBeCloseTo(20, 1);
  });

  it("skips the mileage calculation across a refuel (fuel_pct increased)", async () => {
    const assetRepo = new InMemoryAssetRepository();
    const asset = await assetRepo.create({ org_id: "org-1", fleet_id: "fleet-1", type: "vehicle", display_label: "TN-01" });
    await assetRepo.updateHealth(asset.id, 90, { fuel_pct: 10, odometer_km: 10000 });

    const vehiclePluginClient = new FakeVehiclePluginClientForHealth({}, { [asset.id]: { fuelCapacityLiters: 50 } });
    let handler: (payload: unknown) => Promise<void>;
    const fakeSubscriber = {
      subscribe: vi.fn(async (_subject: string, h: (payload: unknown) => Promise<void>) => {
        handler = h;
        return { unsubscribe: async () => {} };
      }),
    };
    await subscribeAssetHealthChanged(fakeSubscriber as any, assetRepo, {
      vehiclePluginClient: vehiclePluginClient as any,
      suggestionRepo: new InMemoryMaintenanceSuggestionRepository(),
      publisher: new FakePublisher() as any,
    });

    await handler!({
      type: "AssetHealthChanged",
      org_id: "org-1",
      fleet_id: "fleet-1",
      timestamp: new Date().toISOString(),
      asset_id: asset.id,
      healthScore: 90,
      telemetry: { fuel_pct: 90, odometer_km: 10050 }, // refueled
    });

    const updated = await assetRepo.get(asset.id, "org-1", "fleet-1");
    expect(updated?.last_mileage_kmpl).toBeNull();
  });
});
