import { describe, expect, it } from "vitest";
import { computeFleetHealth } from "../fleet-health";
import type { Asset } from "@/components/fleet/types";

function makeAsset(healthScore: number): Asset {
  return {
    id: `asset-${healthScore}-${Math.random()}`,
    org_id: "org-1",
    fleet_id: "fleet-1",
    type: "vehicle",
    display_label: "Test",
    health_score: healthScore,
    telemetry: {},
    telemetry_updated_at: null,
    last_mileage_kmpl: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("computeFleetHealth", () => {
  it("returns a null average and zero count for an empty fleet", () => {
    expect(computeFleetHealth([])).toEqual({ avg: null, needsAttentionCount: 0 });
  });

  it("averages health scores across vehicles", () => {
    const result = computeFleetHealth([makeAsset(80), makeAsset(90), makeAsset(100)]);
    expect(result.avg).toBe(90);
  });

  it("counts vehicles below the needs-attention threshold (50)", () => {
    const result = computeFleetHealth([makeAsset(90), makeAsset(40), makeAsset(20)]);
    expect(result.needsAttentionCount).toBe(2);
  });

  it("rounds the average to the nearest whole number", () => {
    const result = computeFleetHealth([makeAsset(80), makeAsset(81)]);
    expect(result.avg).toBe(81);
  });
});
