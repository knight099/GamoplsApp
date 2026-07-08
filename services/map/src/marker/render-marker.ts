import type { Asset, Locatable } from "@gamopls/asset-contracts";

/** Shape sent to REST/WebSocket clients for a single asset marker. */
export interface RenderedMarker {
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

/**
 * The one function in this service that turns an `Asset` into marker
 * wire-format. Typed only against `Asset & Locatable` from
 * `@gamopls/asset-contracts` — it never inspects `asset.type` to decide
 * how to render. Any current or future Asset Type Plugin (vehicle, drone,
 * vessel, ...) renders correctly here for free, per CLAUDE.md's
 * "never branch on asset type" rule.
 */
export function renderMarker(asset: Asset & Locatable): RenderedMarker {
  return {
    id: asset.id,
    org_id: asset.org_id,
    fleet_id: asset.fleet_id,
    icon: asset.getMapIcon(),
    label: asset.getDisplayLabel(),
    lat: asset.lat,
    lng: asset.lng,
    heading: asset.heading,
    speed: asset.speed,
    positionUpdatedAt: asset.positionUpdatedAt,
  };
}
