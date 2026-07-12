import { ASSET_HEALTH_CHANGED, TASK_SUGGESTED, assetHealthChangedSchema, type EventPublisher, type EventSubscriber } from "@gamopls/event-schemas";
import type { AssetRepository } from "./asset-repository.js";
import type { MaintenanceSuggestionRepository } from "./maintenance-suggestion-repository.js";
import type { VehiclePluginClient } from "./vehicle-plugin-client.js";
import { SERVICE_INTERVALS_KM } from "./service-intervals.js";

export interface HealthSubscriptionDeps {
  vehiclePluginClient?: VehiclePluginClient;
  suggestionRepo?: MaintenanceSuggestionRepository;
  publisher?: EventPublisher;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

async function checkServiceDue(
  event: { org_id: string; fleet_id: string; asset_id: string; timestamp: string },
  odometerKm: number,
  deps: Required<Pick<HealthSubscriptionDeps, "vehiclePluginClient" | "suggestionRepo" | "publisher">>,
): Promise<void> {
  const records = await deps.vehiclePluginClient.getMaintenanceRecords(event.asset_id);

  for (const [serviceType, interval] of Object.entries(SERVICE_INTERVALS_KM)) {
    const lastServiceOdometer = records
      .filter((r) => r.serviceType === serviceType)
      .reduce((max, r) => Math.max(max, r.odometerAtServiceKm), 0);
    const dueAt = lastServiceOdometer + interval;
    if (odometerKm < dueAt) continue;

    const lastSuggestion = await deps.suggestionRepo.get(event.asset_id, serviceType);
    if (lastSuggestion && odometerKm < lastSuggestion.suggested_at_odometer_km + interval) continue;

    await deps.publisher.publish(TASK_SUGGESTED, {
      type: TASK_SUGGESTED,
      org_id: event.org_id,
      fleet_id: event.fleet_id,
      timestamp: event.timestamp,
      asset_id: event.asset_id,
      title: `${serviceType} due for asset ${event.asset_id}`,
      description: `Odometer at ${odometerKm}km has crossed the ${interval}km ${serviceType} interval (last service at ${lastServiceOdometer}km).`,
      source: "fleet.service-interval",
    });
    await deps.suggestionRepo.upsert(event.org_id, event.fleet_id, event.asset_id, serviceType, odometerKm);
  }
}

async function computeMileage(
  assetId: string,
  previousTelemetry: Record<string, unknown>,
  newTelemetry: Record<string, unknown>,
  vehiclePluginClient: VehiclePluginClient,
): Promise<number | null> {
  const oldFuel = numberOrNull(previousTelemetry.fuel_pct);
  const newFuel = numberOrNull(newTelemetry.fuel_pct);
  const oldOdo = numberOrNull(previousTelemetry.odometer_km);
  const newOdo = numberOrNull(newTelemetry.odometer_km);

  if (oldFuel === null || newFuel === null || oldOdo === null || newOdo === null) return null;
  if (newFuel > oldFuel) return null; // refuel — can't infer consumption across this delta
  if (newOdo <= oldOdo) return null;

  const vehicleDetails = await vehiclePluginClient.getVehicleDetails(assetId);
  if (!vehicleDetails || vehicleDetails.fuelCapacityLiters === null) return null;

  const distanceKm = newOdo - oldOdo;
  const fuelConsumedLiters = ((oldFuel - newFuel) / 100) * vehicleDetails.fuelCapacityLiters;
  if (fuelConsumedLiters <= 0) return null;

  return distanceKm / fuelConsumedLiters;
}

/**
 * Subscribes to AssetHealthChanged and persists the latest health score +
 * sensor telemetry snapshot onto the Asset row. Also (when the optional
 * deps are provided): checks whether any service interval has been
 * crossed by the new odometer reading and publishes TaskSuggested at most
 * once per crossing, and computes a rolling fuel-efficiency figure across
 * non-refuel deltas.
 */
export async function subscribeAssetHealthChanged(
  subscriber: EventSubscriber,
  assetRepo: AssetRepository,
  deps: HealthSubscriptionDeps = {},
) {
  return subscriber.subscribe<unknown>(ASSET_HEALTH_CHANGED, async (raw) => {
    const parsed = assetHealthChangedSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("fleet: dropped malformed AssetHealthChanged payload:", parsed.error.flatten());
      return;
    }
    const event = parsed.data;

    // Schema validation only checks shape (asset_id is any non-empty
    // string), not that it's a real, already-registered Asset — a
    // sensor/simulator publishing readings for an asset_id that was never
    // onboarded (or isn't a valid UUID, since Asset.id is @db.Uuid) must
    // be dropped-and-logged, never allowed to crash this subscription:
    // an uncaught error here previously killed the ENTIRE subscription
    // for the process's lifetime, silently stopping ALL future health
    // processing — not just for the one bad asset_id.
    try {
      const existing = await assetRepo.get(event.asset_id, event.org_id, event.fleet_id);
      const previousTelemetry = existing?.telemetry ?? {};

      await assetRepo.updateHealth(event.asset_id, event.healthScore, event.telemetry);

      if (deps.vehiclePluginClient) {
        const mileage = await computeMileage(event.asset_id, previousTelemetry, event.telemetry, deps.vehiclePluginClient);
        if (mileage !== null) {
          await assetRepo.updateMileage(event.asset_id, mileage);
        }

        const odometerKm = numberOrNull(event.telemetry.odometer_km);
        if (odometerKm !== null && deps.suggestionRepo && deps.publisher) {
          await checkServiceDue(event, odometerKm, {
            vehiclePluginClient: deps.vehiclePluginClient,
            suggestionRepo: deps.suggestionRepo,
            publisher: deps.publisher,
          });
        }
      }
    } catch (err) {
      console.error(`fleet: dropped AssetHealthChanged for asset ${event.asset_id} — processing error:`, err);
    }
  });
}
