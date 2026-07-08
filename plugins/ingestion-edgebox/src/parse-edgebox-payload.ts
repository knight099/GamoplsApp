import {
  ASSET_HEALTH_CHANGED,
  ASSET_LOCATION_UPDATED,
  assetHealthChangedSchema,
  assetLocationUpdatedSchema,
  type AssetHealthChanged,
  type AssetLocationUpdated,
} from "@gamopls/event-schemas";
import type { RawEdgeBoxPayload } from "./edgebox-payload.js";

export interface EdgeBoxParseSuccess {
  locationUpdate?: AssetLocationUpdated;
  healthUpdate?: AssetHealthChanged;
}

export interface EdgeBoxParseFailure {
  error: string;
}

export type EdgeBoxParseResult = EdgeBoxParseSuccess | EdgeBoxParseFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Parses a raw Edge Box MQTT payload (untrusted `unknown` JSON) into
 * normalized, schema-validated `@gamopls/event-schemas` DTOs.
 *
 * This is a pure function: no I/O, no throwing. Malformed input always
 * produces `{ error: string }` so callers (the Go core-ingestion service's
 * equivalent parser, or any TS caller) can drop-and-log rather than crash
 * the MQTT subscriber loop on one bad message.
 *
 * All Edge Box protocol-specific parsing logic lives in this package —
 * consumers (services/core-ingestion) must not reimplement or bypass it
 * (the Go service mirrors this logic natively since it can't import TS
 * in-process, per CLAUDE.md's "plugins are separate deployable services"
 * rule).
 */
export function parseEdgeBoxPayload(raw: unknown): EdgeBoxParseResult {
  if (!isRecord(raw)) {
    return { error: "payload is not a JSON object" };
  }

  const { device_id, asset_id, org_id, fleet_id, ts, gps, telemetry } =
    raw as Partial<RawEdgeBoxPayload>;

  if (!isNonEmptyString(device_id)) {
    return { error: "missing or invalid required field: device_id" };
  }
  if (!isNonEmptyString(asset_id)) {
    return { error: "missing or invalid required field: asset_id" };
  }
  if (!isNonEmptyString(org_id)) {
    return { error: "missing or invalid required field: org_id" };
  }
  if (!isNonEmptyString(fleet_id)) {
    return { error: "missing or invalid required field: fleet_id" };
  }
  if (!isNonEmptyString(ts)) {
    return { error: "missing or invalid required field: ts" };
  }
  const timestamp = new Date(ts);
  if (Number.isNaN(timestamp.getTime())) {
    return { error: `invalid timestamp: ${ts}` };
  }

  const result: EdgeBoxParseSuccess = {};
  const isoTimestamp = timestamp.toISOString();

  if (gps !== undefined) {
    if (!isRecord(gps) || typeof gps.lat !== "number" || typeof gps.lng !== "number") {
      return { error: "invalid gps block: lat/lng must be numbers when gps is present" };
    }

    const locationCandidate = {
      type: ASSET_LOCATION_UPDATED,
      org_id,
      fleet_id,
      timestamp: isoTimestamp,
      asset_id,
      lat: gps.lat,
      lng: gps.lng,
      ...(typeof gps.heading === "number" ? { heading: gps.heading } : {}),
      ...(typeof gps.speed_kmh === "number" ? { speed: gps.speed_kmh } : {}),
    };

    const parsed = assetLocationUpdatedSchema.safeParse(locationCandidate);
    if (!parsed.success) {
      return { error: `invalid location payload: ${parsed.error.message}` };
    }
    result.locationUpdate = parsed.data;
  }

  if (telemetry !== undefined) {
    if (!isRecord(telemetry)) {
      return { error: "invalid telemetry block: must be an object" };
    }
    // health_score is required to emit a health event: this plugin does not
    // invent a score if the device hasn't computed one (see edgebox-payload.ts).
    if (typeof telemetry.health_score === "number") {
      const { health_score, ...restTelemetry } = telemetry;
      const healthCandidate = {
        type: ASSET_HEALTH_CHANGED,
        org_id,
        fleet_id,
        timestamp: isoTimestamp,
        asset_id,
        healthScore: health_score,
        telemetry: restTelemetry,
      };

      const parsed = assetHealthChangedSchema.safeParse(healthCandidate);
      if (!parsed.success) {
        return { error: `invalid health payload: ${parsed.error.message}` };
      }
      result.healthUpdate = parsed.data;
    }
  }

  if (!result.locationUpdate && !result.healthUpdate) {
    return { error: "payload contained neither a usable gps block nor a health_score" };
  }

  return result;
}
