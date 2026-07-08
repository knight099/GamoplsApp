import { describe, expect, it } from "vitest";
import { parseEdgeBoxPayload } from "../parse-edgebox-payload.js";

const validPayload = {
  device_id: "edgebox-042",
  asset_id: "vehicle-042",
  org_id: "org-chennai-pilot",
  fleet_id: "fleet-north",
  ts: "2026-07-08T10:15:30.000Z",
  gps: { lat: 13.0827, lng: 80.2707, heading: 87.5, speed_kmh: 42.1 },
  telemetry: { battery_pct: 76, engine_temp_c: 91.2, fuel_pct: 54, health_score: 88 },
};

describe("parseEdgeBoxPayload", () => {
  it("normalizes a full valid payload into both a location and health update", () => {
    const result = parseEdgeBoxPayload(validPayload);

    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.locationUpdate).toMatchObject({
      type: "AssetLocationUpdated",
      org_id: "org-chennai-pilot",
      fleet_id: "fleet-north",
      asset_id: "vehicle-042",
      lat: 13.0827,
      lng: 80.2707,
      heading: 87.5,
      speed: 42.1,
    });

    expect(result.healthUpdate).toMatchObject({
      type: "AssetHealthChanged",
      org_id: "org-chennai-pilot",
      fleet_id: "fleet-north",
      asset_id: "vehicle-042",
      healthScore: 88,
      telemetry: { battery_pct: 76, engine_temp_c: 91.2, fuel_pct: 54 },
    });
  });

  it("normalizes a gps-only payload (no telemetry block) into just a location update", () => {
    const { telemetry: _telemetry, ...gpsOnly } = validPayload;
    const result = parseEdgeBoxPayload(gpsOnly);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.locationUpdate).toBeDefined();
    expect(result.healthUpdate).toBeUndefined();
  });

  it("normalizes a telemetry-only payload (no gps block) into just a health update", () => {
    const { gps: _gps, ...telemetryOnly } = validPayload;
    const result = parseEdgeBoxPayload(telemetryOnly);

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.locationUpdate).toBeUndefined();
    expect(result.healthUpdate).toBeDefined();
  });

  it("does not emit a health update when telemetry has no health_score", () => {
    const result = parseEdgeBoxPayload({
      ...validPayload,
      telemetry: { battery_pct: 76 },
    });

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.healthUpdate).toBeUndefined();
    expect(result.locationUpdate).toBeDefined();
  });

  it.each([
    ["not an object", "just a string"],
    ["null", null],
    ["array", [1, 2, 3]],
  ])("returns an error, not a throw, for non-object input: %s", (_label, input) => {
    expect(() => parseEdgeBoxPayload(input)).not.toThrow();
    const result = parseEdgeBoxPayload(input);
    expect("error" in result).toBe(true);
  });

  it("returns an error for missing required fields", () => {
    const { device_id: _device_id, ...missingDeviceId } = validPayload;
    const result = parseEdgeBoxPayload(missingDeviceId);
    expect("error" in result).toBe(true);
  });

  it("returns an error for an invalid timestamp", () => {
    const result = parseEdgeBoxPayload({ ...validPayload, ts: "not-a-date" });
    expect("error" in result).toBe(true);
  });

  it("returns an error for out-of-range lat/lng (fails zod schema validation)", () => {
    const result = parseEdgeBoxPayload({
      ...validPayload,
      gps: { ...validPayload.gps, lat: 999 },
    });
    expect("error" in result).toBe(true);
  });

  it("returns an error when gps is present but lat/lng are not numbers", () => {
    const result = parseEdgeBoxPayload({
      ...validPayload,
      gps: { lat: "not-a-number", lng: 80.2 },
    });
    expect("error" in result).toBe(true);
  });

  it("returns an error when neither gps nor a usable health_score is present", () => {
    const { gps: _gps, telemetry: _telemetry, ...neither } = validPayload;
    const result = parseEdgeBoxPayload(neither);
    expect("error" in result).toBe(true);
  });

  it("never throws on garbage input", () => {
    expect(() => parseEdgeBoxPayload(undefined)).not.toThrow();
    expect(() => parseEdgeBoxPayload(42)).not.toThrow();
    expect(() => parseEdgeBoxPayload({ garbage: true })).not.toThrow();
  });
});
