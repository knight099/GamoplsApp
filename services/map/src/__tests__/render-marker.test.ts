import { describe, expect, it } from "vitest";
import type { Asset, Locatable } from "@gamopls/asset-contracts";
import { renderMarker } from "../marker/render-marker.js";
import { AssetMarker } from "../marker/asset-marker.js";

/**
 * A second, independent fake "plugin" fixture (distinct from AssetMarker)
 * to prove `renderMarker` works against any `Asset & Locatable`
 * implementation via polymorphism alone — never via `asset.type` checks.
 * This mirrors the LSP proof pattern in
 * packages/asset-contracts/src/__tests__/test-asset.test.ts.
 */
class FakeDroneAsset implements Asset, Locatable {
  readonly id = "drone-1";
  readonly org_id = "org-1";
  readonly fleet_id = "fleet-1";
  readonly type = "drone";
  readonly pluginMetadata = {};
  lat = 40.7;
  lng = -74.0;
  heading = 270;
  speed = 5;
  positionUpdatedAt = new Date(0).toISOString();

  getMapIcon(): string {
    return "drone-icon";
  }
  getDisplayLabel(): string {
    return "Drone One";
  }
}

describe("renderMarker", () => {
  it("renders a marker from an AssetMarker (vehicle-shaped snapshot) using getMapIcon/getDisplayLabel", () => {
    const marker = new AssetMarker({
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
      positionUpdatedAt: "2024-01-01T00:00:00.000Z",
    });

    expect(renderMarker(marker)).toEqual({
      id: "asset-1",
      org_id: "org-1",
      fleet_id: "fleet-1",
      icon: "vehicle-icon",
      label: "Truck 1",
      lat: 12.9,
      lng: 80.2,
      heading: 90,
      speed: 10,
      positionUpdatedAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("renders a marker from a completely different Asset implementation with zero type branching", () => {
    // The point: renderMarker's source has no `if (asset.type === ...)`.
    // Feeding it a differently-typed asset ("drone" vs "vehicle") produces
    // correct, plugin-owned output purely via getMapIcon()/getDisplayLabel().
    const drone = new FakeDroneAsset();

    expect(renderMarker(drone)).toEqual({
      id: "drone-1",
      org_id: "org-1",
      fleet_id: "fleet-1",
      icon: "drone-icon",
      label: "Drone One",
      lat: 40.7,
      lng: -74.0,
      heading: 270,
      speed: 5,
      positionUpdatedAt: new Date(0).toISOString(),
    });
  });
});
