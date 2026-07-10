import { describe, expect, it } from "vitest";
import {
  ALERT_RAISED,
  alertRaisedSchema,
  ASSET_HEALTH_CHANGED,
  ASSET_HEALTH_RAW_SUBJECT,
  assetHealthChangedSchema,
  ASSET_LOCATION_UPDATED,
  assetLocationUpdatedSchema,
  MESSAGE_POSTED,
  messagePostedSchema,
  TASK_SUGGESTED,
  taskSuggestedSchema,
} from "../index.js";

const base = {
  org_id: "org-1",
  fleet_id: "fleet-1",
  timestamp: new Date().toISOString(),
};

describe("assetLocationUpdatedSchema", () => {
  it("accepts a valid payload", () => {
    const result = assetLocationUpdatedSchema.safeParse({
      ...base,
      type: ASSET_LOCATION_UPDATED,
      asset_id: "asset-1",
      lat: 12.9,
      lng: 80.2,
      heading: 90,
      speed: 12.5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects out-of-range lat/lng", () => {
    const result = assetLocationUpdatedSchema.safeParse({
      ...base,
      type: ASSET_LOCATION_UPDATED,
      asset_id: "asset-1",
      lat: 200,
      lng: 80.2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects payload missing org_id/fleet_id", () => {
    const result = assetLocationUpdatedSchema.safeParse({
      type: ASSET_LOCATION_UPDATED,
      asset_id: "asset-1",
      lat: 12.9,
      lng: 80.2,
      timestamp: base.timestamp,
    });
    expect(result.success).toBe(false);
  });
});

describe("health subjects (wire contract)", () => {
  it("keeps the raw subject distinct from the scored subject", () => {
    // Ingestion publishes raw readings on ASSET_HEALTH_RAW_SUBJECT; only
    // ai-engine consumes them and republishes scored events on the
    // AssetHealthChanged subject. Same payload schema on both.
    expect(ASSET_HEALTH_RAW_SUBJECT).toBe("AssetHealthRaw");
    expect(ASSET_HEALTH_RAW_SUBJECT).not.toBe(ASSET_HEALTH_CHANGED);
  });

  it("validates a raw-subject payload with the unforked schema", () => {
    const result = assetHealthChangedSchema.safeParse({
      ...base,
      type: ASSET_HEALTH_CHANGED, // type literal is unchanged on the raw subject
      asset_id: "asset-1",
      healthScore: 42,
      telemetry: { battery_pct: 42 },
    });
    expect(result.success).toBe(true);
  });
});

describe("assetHealthChangedSchema", () => {
  it("accepts a valid payload", () => {
    const result = assetHealthChangedSchema.safeParse({
      ...base,
      type: ASSET_HEALTH_CHANGED,
      asset_id: "asset-1",
      healthScore: 87,
      telemetry: { fuelLevel: 0.6 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects healthScore out of 0-100 range", () => {
    const result = assetHealthChangedSchema.safeParse({
      ...base,
      type: ASSET_HEALTH_CHANGED,
      asset_id: "asset-1",
      healthScore: 150,
    });
    expect(result.success).toBe(false);
  });
});

describe("alertRaisedSchema", () => {
  it("accepts a valid payload", () => {
    const result = alertRaisedSchema.safeParse({
      ...base,
      type: ALERT_RAISED,
      asset_id: "asset-1",
      severity: "critical",
      reason: "geofence_exit",
      message: "Vehicle exited geofence Zone A",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid severity", () => {
    const result = alertRaisedSchema.safeParse({
      ...base,
      type: ALERT_RAISED,
      asset_id: "asset-1",
      severity: "catastrophic",
      reason: "geofence_exit",
      message: "Vehicle exited geofence Zone A",
    });
    expect(result.success).toBe(false);
  });
});

describe("taskSuggestedSchema", () => {
  it("accepts a valid payload", () => {
    const result = taskSuggestedSchema.safeParse({
      ...base,
      type: TASK_SUGGESTED,
      asset_id: "asset-1",
      title: "Schedule maintenance",
      description: "Health score dropped below 40",
      source: "ai-engine.health-score",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = taskSuggestedSchema.safeParse({
      ...base,
      type: TASK_SUGGESTED,
      asset_id: "asset-1",
      title: "",
      description: "Health score dropped below 40",
      source: "ai-engine.health-score",
    });
    expect(result.success).toBe(false);
  });
});

describe("messagePostedSchema", () => {
  it("accepts a valid payload without asset_id", () => {
    const result = messagePostedSchema.safeParse({
      ...base,
      type: MESSAGE_POSTED,
      mission_channel_id: "channel-1",
      author_id: "user-1",
      body: "On our way.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid payload with asset_id", () => {
    const result = messagePostedSchema.safeParse({
      ...base,
      type: MESSAGE_POSTED,
      mission_channel_id: "channel-1",
      asset_id: "asset-1",
      author_id: "system",
      body: "Alert: geofence exit.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty body", () => {
    const result = messagePostedSchema.safeParse({
      ...base,
      type: MESSAGE_POSTED,
      mission_channel_id: "channel-1",
      author_id: "user-1",
      body: "",
    });
    expect(result.success).toBe(false);
  });
});
