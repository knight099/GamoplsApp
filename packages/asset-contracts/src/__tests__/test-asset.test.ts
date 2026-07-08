import { describe, expect, it } from "vitest";
import type {
  Alertable,
  AlertThreshold,
  Asset,
  Communicable,
  Locatable,
  Monitorable,
  Taskable,
} from "../index.js";

/**
 * TestAsset — a fixture implementing the base Asset interface plus all
 * five role interfaces. This is a compile-time + runtime proof that the
 * contracts in this package are composable (ISP) and that a single class
 * can satisfy every role without any of them leaking type-specific
 * concerns into the shared interfaces.
 *
 * A future concrete plugin (e.g. plugins/asset-vehicle's Vehicle class)
 * follows the same shape.
 */
class TestAsset implements Asset, Locatable, Monitorable, Alertable, Communicable, Taskable {
  readonly id: string;
  readonly org_id: string;
  readonly fleet_id: string;
  readonly type = "test-asset";
  readonly pluginMetadata: Record<string, unknown> = {};

  lat = 0;
  lng = 0;
  heading = 0;
  speed = 0;
  positionUpdatedAt = new Date(0).toISOString();

  healthScore = 100;
  telemetry: Record<string, unknown> = {};
  telemetryUpdatedAt = new Date(0).toISOString();

  alertThresholds: AlertThreshold[] = [];
  hasActiveAlert = false;

  missionChannelId: string | null = null;
  assignedTaskId: string | null = null;

  constructor(id: string, org_id: string, fleet_id: string) {
    this.id = id;
    this.org_id = org_id;
    this.fleet_id = fleet_id;
  }

  getMapIcon(): string {
    return "test-asset-icon";
  }

  getDisplayLabel(): string {
    return `TestAsset ${this.id}`;
  }
}

/**
 * A minimal example of the pattern module services must follow: a function
 * typed only against the shared Asset (+ role) interfaces, never against a
 * concrete plugin class, and never branching on `asset.type`.
 */
function renderMarker(asset: Asset & Locatable): { icon: string; label: string; lat: number; lng: number } {
  return {
    icon: asset.getMapIcon(),
    label: asset.getDisplayLabel(),
    lat: asset.lat,
    lng: asset.lng,
  };
}

describe("TestAsset fixture", () => {
  it("implements Asset plus all five role interfaces", () => {
    const asset = new TestAsset("asset-1", "org-1", "fleet-1");

    expect(asset.id).toBe("asset-1");
    expect(asset.org_id).toBe("org-1");
    expect(asset.fleet_id).toBe("fleet-1");
    expect(asset.getMapIcon()).toBe("test-asset-icon");
    expect(asset.getDisplayLabel()).toBe("TestAsset asset-1");
  });

  it("is usable through a consuming-service-shaped function without type checks", () => {
    const asset = new TestAsset("asset-2", "org-1", "fleet-1");
    asset.lat = 12.9;
    asset.lng = 80.2;

    const marker = renderMarker(asset);

    expect(marker).toEqual({
      icon: "test-asset-icon",
      label: "TestAsset asset-2",
      lat: 12.9,
      lng: 80.2,
    });
  });

  it("satisfies Monitorable, Alertable, Communicable, and Taskable independently", () => {
    const asset = new TestAsset("asset-3", "org-1", "fleet-1");
    asset.healthScore = 42;
    asset.hasActiveAlert = true;
    asset.missionChannelId = "channel-1";
    asset.assignedTaskId = "task-1";

    const monitorable: Monitorable = asset;
    const alertable: Alertable = asset;
    const communicable: Communicable = asset;
    const taskable: Taskable = asset;

    expect(monitorable.healthScore).toBe(42);
    expect(alertable.hasActiveAlert).toBe(true);
    expect(communicable.missionChannelId).toBe("channel-1");
    expect(taskable.assignedTaskId).toBe("task-1");
  });
});
