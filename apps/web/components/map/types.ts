/**
 * Wire types for the MAP view. These mirror (but intentionally don't
 * import — apps/web can't depend on services/map's source) the shapes
 * `services/map` actually returns:
 *   - `RenderedMarker`: services/map/src/marker/render-marker.ts
 *   - `Geofence`: services/map/src/geofence/types.ts
 *
 * Note the marker shape only ever carries a generic `icon`/`label` string
 * pair produced server-side by `asset.getMapIcon()`/`getDisplayLabel()` —
 * this view must render those verbatim and must NEVER branch on
 * `type`/`pluginMetadata` to decide how something looks, per CLAUDE.md's
 * "never branch on asset type" rule.
 */

/** A single asset's current rendered position, as returned by
 * `GET /fleets/:fleetId/positions` and the (unused in V1) WS stream. */
export interface AssetMarker {
  id: string;
  org_id: string;
  fleet_id: string;
  icon: string;
  label: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  positionUpdatedAt: string;
}

export interface FleetPositionsResponse {
  fleet_id: string;
  positions: AssetMarker[];
}

/** Circular geofence, as returned by the `/geofences` CRUD endpoints. */
export interface Geofence {
  id: string;
  org_id: string;
  fleet_id: string;
  asset_id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  createdAt: string;
  updatedAt: string;
}

export interface GeofenceListResponse {
  geofences: Geofence[];
}

/** Payload for creating a geofence via the form. Tenant scope (org/fleet)
 * is attached server-side by the gateway as a signed header
 * (apps/web/lib/gateway-proxy.ts) — the body must not carry it. */
export interface GeofenceFormInput {
  asset_id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
}
