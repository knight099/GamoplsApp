import {
  ALERT_RAISED,
  alertRaisedSchema,
  type AlertRaised,
  type AssetLocationUpdated,
  type EventPublisher,
} from "@gamopls/event-schemas";
import { distanceMeters } from "./haversine.js";
import type { GeofenceStore } from "./geofence-store.js";

/**
 * Watches position updates against each asset's assigned geofence(s) and
 * publishes `AlertRaised` (via the `EventPublisher` port — never a
 * concrete transport) the moment an asset transitions from inside to
 * outside a geofence.
 *
 * State tracking: we remember the last known inside/outside state per
 * (geofence, asset) pair so we only fire once per exit, not on every
 * subsequent outside position update. The first position observed for a
 * given (geofence, asset) pair only seeds the baseline state — it never
 * fires an alert, since we don't know whether the asset was already
 * outside before this service started watching it.
 */
export class GeofenceExitDetector {
  private readonly insideState = new Map<string, boolean>();

  constructor(
    private readonly geofenceStore: GeofenceStore,
    private readonly publisher: EventPublisher,
  ) {}

  private stateKey(geofenceId: string, assetId: string): string {
    return `${geofenceId}::${assetId}`;
  }

  async checkPosition(update: AssetLocationUpdated): Promise<void> {
    const geofences = this.geofenceStore.listByAsset(update.asset_id);

    for (const geofence of geofences) {
      const distance = distanceMeters(
        geofence.centerLat,
        geofence.centerLng,
        update.lat,
        update.lng,
      );
      const isInside = distance <= geofence.radiusMeters;
      const key = this.stateKey(geofence.id, update.asset_id);
      const wasInside = this.insideState.get(key);

      this.insideState.set(key, isInside);

      if (wasInside === true && isInside === false) {
        const alert: AlertRaised = alertRaisedSchema.parse({
          type: ALERT_RAISED,
          org_id: update.org_id,
          fleet_id: update.fleet_id,
          timestamp: new Date().toISOString(),
          asset_id: update.asset_id,
          severity: "warning",
          reason: "geofence_exit",
          message: `Asset ${update.asset_id} exited geofence "${geofence.name}"`,
        });
        await this.publisher.publish(ALERT_RAISED, alert);
      }
    }
  }

  /** Test/ops helper: drop tracked inside/outside state. */
  reset(): void {
    this.insideState.clear();
  }
}
