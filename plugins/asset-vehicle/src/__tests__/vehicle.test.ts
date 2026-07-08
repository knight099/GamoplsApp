import { describe, expect, it } from "vitest";
import type { Alertable, Asset, Communicable, Locatable, Monitorable, Taskable } from "@gamopls/asset-contracts";
import { Vehicle } from "../vehicle.js";

function makeVehicle(overrides: Partial<ConstructorParameters<typeof Vehicle>[0]> = {}): Vehicle {
  return new Vehicle({
    id: "asset-1",
    org_id: "org-1",
    fleet_id: "fleet-1",
    plateNumber: "TN-09-AB-1234",
    vehicleType: "truck",
    fuelType: "diesel",
    lat: 12.97,
    lng: 80.24,
    healthScore: 88,
    ...overrides,
  });
}

describe("Vehicle", () => {
  it("implements Asset plus all five role interfaces (runtime shape check)", () => {
    const vehicle = makeVehicle();

    const asset: Asset = vehicle;
    const locatable: Locatable = vehicle;
    const monitorable: Monitorable = vehicle;
    const alertable: Alertable = vehicle;
    const communicable: Communicable = vehicle;
    const taskable: Taskable = vehicle;

    expect(asset.id).toBe("asset-1");
    expect(asset.org_id).toBe("org-1");
    expect(asset.fleet_id).toBe("fleet-1");
    expect(asset.type).toBe("vehicle");
    expect(typeof asset.getMapIcon).toBe("function");
    expect(typeof asset.getDisplayLabel).toBe("function");

    expect(typeof locatable.lat).toBe("number");
    expect(typeof locatable.lng).toBe("number");

    expect(typeof monitorable.healthScore).toBe("number");
    expect(monitorable.healthScore).toBeGreaterThanOrEqual(0);
    expect(monitorable.healthScore).toBeLessThanOrEqual(100);

    expect(Array.isArray(alertable.alertThresholds)).toBe(true);
    expect(typeof alertable.hasActiveAlert).toBe("boolean");

    expect(communicable.missionChannelId).toBeNull();
    expect(taskable.assignedTaskId).toBeNull();
  });

  it("getMapIcon() returns a vehicle-type-specific icon identifier", () => {
    expect(makeVehicle({ vehicleType: "truck" }).getMapIcon()).toBe("vehicle-truck");
    expect(makeVehicle({ vehicleType: "van" }).getMapIcon()).toBe("vehicle-van");
    expect(makeVehicle({ vehicleType: "bike" }).getMapIcon()).toBe("vehicle-bike");
  });

  it("getDisplayLabel() returns plate number + vehicle type", () => {
    const vehicle = makeVehicle({ plateNumber: "TN-09-AB-1234", vehicleType: "truck" });
    expect(vehicle.getDisplayLabel()).toBe("TN-09-AB-1234 (truck)");
  });

  it("healthScore stays within the 0-100 contract range for degraded vehicles", () => {
    const vehicle = makeVehicle({ healthScore: 12, hasActiveAlert: true });
    expect(vehicle.healthScore).toBe(12);
    expect(vehicle.healthScore).toBeGreaterThanOrEqual(0);
    expect(vehicle.healthScore).toBeLessThanOrEqual(100);
    expect(vehicle.hasActiveAlert).toBe(true);
  });

  it("lat/lng are numbers and reflect constructor input", () => {
    const vehicle = makeVehicle({ lat: 13.08, lng: 80.27 });
    expect(typeof vehicle.lat).toBe("number");
    expect(typeof vehicle.lng).toBe("number");
    expect(vehicle.lat).toBe(13.08);
    expect(vehicle.lng).toBe(80.27);
  });

  it("defaults pluginMetadata, telemetry, alertThresholds to safe empty values", () => {
    const vehicle = makeVehicle();
    expect(vehicle.pluginMetadata).toEqual({});
    expect(vehicle.telemetry).toEqual({});
    expect(vehicle.alertThresholds).toEqual([]);
  });
});

/**
 * Acceptance test from PLAN.md Phase 2: "a module service holding only an
 * Asset[] (typed via asset-contracts) can render a vehicle's map icon and
 * health score with zero knowledge that it's a vehicle."
 *
 * This function is typed only against the shared contracts — Asset +
 * Monitorable + Locatable — never against `Vehicle`, and contains no
 * `instanceof Vehicle` / `asset.type === 'vehicle'` check anywhere. A real
 * module service (services/map) would look exactly like this.
 */
function renderFleetSummary(
  assets: Array<Asset & Locatable & Monitorable>,
): Array<{ icon: string; label: string; lat: number; lng: number; healthScore: number }> {
  return assets.map((asset) => ({
    icon: asset.getMapIcon(),
    label: asset.getDisplayLabel(),
    lat: asset.lat,
    lng: asset.lng,
    healthScore: asset.healthScore,
  }));
}

describe("LSP acceptance: module service consuming Vehicle via shared contracts only", () => {
  it("renders map icon and health score for a fleet of Vehicles with zero vehicle-specific knowledge", () => {
    const fleet: Array<Asset & Locatable & Monitorable> = [
      makeVehicle({ id: "v1", plateNumber: "TN-09-AB-1234", vehicleType: "truck", healthScore: 91 }),
      makeVehicle({ id: "v2", plateNumber: "TN-09-CD-5678", vehicleType: "van", healthScore: 47 }),
    ];

    const summary = renderFleetSummary(fleet);

    expect(summary).toEqual([
      { icon: "vehicle-truck", label: "TN-09-AB-1234 (truck)", lat: 12.97, lng: 80.24, healthScore: 91 },
      { icon: "vehicle-van", label: "TN-09-CD-5678 (van)", lat: 12.97, lng: 80.24, healthScore: 47 },
    ]);
  });
});
