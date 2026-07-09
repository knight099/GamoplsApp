import { describe, expect, it, vi } from "vitest";
import { ASSET_HEALTH_CHANGED } from "@gamopls/event-schemas";
import { subscribeAssetHealthChanged } from "../health-subscription.js";
import { InMemoryAssetRepository } from "../in-memory-asset-repository.js";

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
});
