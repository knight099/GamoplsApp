import type { Asset, Locatable } from "@gamopls/asset-contracts";

/**
 * Plain, JSON-serializable snapshot of everything `map` knows about an
 * asset's identity + position. This is what actually lives in the position
 * cache (Redis-serializable) — `AssetMarker` below wraps a snapshot so it
 * satisfies the `Asset & Locatable` interfaces for rendering.
 *
 * `map` never resolves a concrete plugin instance (no plugin registry
 * lookup exists yet, see CLAUDE.md/PLAN.md Phase 4.1 scope note) — instead
 * it accepts asset-shaped identity data (icon/label/type/pluginMetadata)
 * out-of-band via `PUT /assets/:assetId/metadata` and merges it with the
 * position fields carried on `AssetLocationUpdated` events. If no metadata
 * has been supplied yet for an asset, sensible defaults are used.
 */
export interface AssetPositionSnapshot {
  id: string;
  org_id: string;
  fleet_id: string;
  type: string;
  pluginMetadata: Record<string, unknown>;
  mapIcon: string;
  displayLabel: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  positionUpdatedAt: string;
}

export const DEFAULT_MAP_ICON = "generic-asset-marker";

export function defaultDisplayLabel(assetId: string): string {
  return `Asset ${assetId}`;
}

/**
 * Wraps an `AssetPositionSnapshot` so it satisfies `Asset & Locatable`.
 * Crucially, `getMapIcon()`/`getDisplayLabel()` just return the
 * plugin-supplied (or defaulted) values already stored on the snapshot —
 * there is no `if (this.type === 'vehicle')` branch here or anywhere else
 * in this service (see `render-marker.ts` and its tests).
 */
export class AssetMarker implements Asset, Locatable {
  readonly id: string;
  readonly org_id: string;
  readonly fleet_id: string;
  readonly type: string;
  readonly pluginMetadata: Record<string, unknown>;

  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  positionUpdatedAt: string;

  private readonly mapIcon: string;
  private readonly displayLabel: string;

  constructor(snapshot: AssetPositionSnapshot) {
    this.id = snapshot.id;
    this.org_id = snapshot.org_id;
    this.fleet_id = snapshot.fleet_id;
    this.type = snapshot.type;
    this.pluginMetadata = snapshot.pluginMetadata;
    this.lat = snapshot.lat;
    this.lng = snapshot.lng;
    this.heading = snapshot.heading;
    this.speed = snapshot.speed;
    this.positionUpdatedAt = snapshot.positionUpdatedAt;
    this.mapIcon = snapshot.mapIcon;
    this.displayLabel = snapshot.displayLabel;
  }

  getMapIcon(): string {
    return this.mapIcon;
  }

  getDisplayLabel(): string {
    return this.displayLabel;
  }
}
