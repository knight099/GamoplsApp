import { ASSET_HEALTH_CHANGED, assetHealthChangedSchema, type EventSubscriber } from "@gamopls/event-schemas";
import type { AssetRepository } from "./asset-repository.js";

/**
 * Subscribes to AssetHealthChanged and persists the latest health score +
 * sensor telemetry snapshot onto the Asset row — the durable counterpart to
 * services/map's Redis position cache for AssetLocationUpdated. Mirrors
 * services/board's task-suggested-handler.ts pattern: re-validate on
 * receipt, drop-and-log on malformed payloads rather than throw.
 */
export async function subscribeAssetHealthChanged(subscriber: EventSubscriber, assetRepo: AssetRepository) {
  return subscriber.subscribe<unknown>(ASSET_HEALTH_CHANGED, async (raw) => {
    const parsed = assetHealthChangedSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("fleet: dropped malformed AssetHealthChanged payload:", parsed.error.flatten());
      return;
    }
    const event = parsed.data;
    await assetRepo.updateHealth(event.asset_id, event.healthScore, event.telemetry);
  });
}
