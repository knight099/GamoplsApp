import type { AssetLocationUpdated, EventPublisher } from "@gamopls/event-schemas";
import type { PositionCache } from "./cache/position-cache.js";
import { GeofenceExitDetector } from "./geofence/geofence-detector.js";
import { GeofenceStore } from "./geofence/geofence-store.js";
import { AssetMarker, DEFAULT_MAP_ICON, defaultDisplayLabel } from "./marker/asset-marker.js";
import type { AssetPositionSnapshot } from "./marker/asset-marker.js";
import { renderMarker } from "./marker/render-marker.js";
import { PositionBroadcaster } from "./position-broadcaster.js";

/**
 * Identity/rendering metadata for an asset, supplied out-of-band (see
 * `AssetPositionSnapshot`'s doc comment for why: no live plugin registry
 * lookup exists yet in this service, per Phase 4.1 scope).
 */
export interface AssetMetadataInput {
  type: string;
  mapIcon: string;
  displayLabel: string;
  pluginMetadata?: Record<string, unknown>;
}

/**
 * Orchestrates the pieces this service owns: the live position cache, the
 * geofence store + exit detector, and the WS broadcaster. This is the
 * single place `AssetLocationUpdated` events (from NATS in production, or
 * fed directly in tests) get turned into cache writes + geofence checks +
 * WS pushes, so `server.ts` and tests share one code path.
 */
export class MapService {
  readonly geofenceStore = new GeofenceStore();
  readonly broadcaster = new PositionBroadcaster();
  private readonly detector: GeofenceExitDetector;

  constructor(
    private readonly cache: PositionCache,
    publisher: EventPublisher,
  ) {
    this.detector = new GeofenceExitDetector(this.geofenceStore, publisher);
  }

  /** Merge asset identity/rendering metadata, supplied via the REST metadata endpoint. */
  async setAssetMetadata(
    assetId: string,
    orgId: string,
    fleetId: string,
    metadata: AssetMetadataInput,
  ): Promise<AssetPositionSnapshot> {
    const existing = await this.cache.get(assetId);
    const snapshot: AssetPositionSnapshot = {
      id: assetId,
      org_id: orgId,
      fleet_id: fleetId,
      type: metadata.type,
      pluginMetadata: metadata.pluginMetadata ?? {},
      mapIcon: metadata.mapIcon,
      displayLabel: metadata.displayLabel,
      lat: existing?.lat ?? 0,
      lng: existing?.lng ?? 0,
      heading: existing?.heading,
      speed: existing?.speed,
      positionUpdatedAt: existing?.positionUpdatedAt ?? new Date(0).toISOString(),
    };
    await this.cache.set(snapshot);
    return snapshot;
  }

  /**
   * Handles one `AssetLocationUpdated` event: updates the position cache
   * (preserving any previously-set identity metadata), runs geofence exit
   * detection (may publish `AlertRaised`), and broadcasts the fleet's
   * updated marker list to any connected WebSocket clients.
   */
  async handleLocationUpdate(update: AssetLocationUpdated): Promise<void> {
    const existing = await this.cache.get(update.asset_id);
    const snapshot: AssetPositionSnapshot = {
      id: update.asset_id,
      org_id: update.org_id,
      fleet_id: update.fleet_id,
      type: existing?.type ?? "unknown",
      pluginMetadata: existing?.pluginMetadata ?? {},
      mapIcon: existing?.mapIcon ?? DEFAULT_MAP_ICON,
      displayLabel: existing?.displayLabel ?? defaultDisplayLabel(update.asset_id),
      lat: update.lat,
      lng: update.lng,
      heading: update.heading,
      speed: update.speed,
      positionUpdatedAt: update.timestamp,
    };
    await this.cache.set(snapshot);
    await this.detector.checkPosition(update);

    const fleetMarkers = await this.getFleetMarkers(update.fleet_id);
    this.broadcaster.publish(update.fleet_id, fleetMarkers);
  }

  /** Current rendered markers for every asset cached under a fleet. Used by REST reads, WS initial snapshot, and broadcast fan-out. */
  async getFleetMarkers(fleetId: string) {
    const snapshots = await this.cache.listByFleet(fleetId);
    return snapshots.map((snapshot) => renderMarker(new AssetMarker(snapshot)));
  }
}
