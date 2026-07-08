/**
 * Raw Edge Box telemetry payload shape (as published by GAMOPLS Edge Box
 * hardware over MQTT, JSON-encoded).
 *
 * This is a plausible, invented-for-V1 schema — Edge Box firmware publishes
 * one JSON object per telemetry tick to a topic like
 * `edgebox/<org_id>/<fleet_id>/<device_id>/telemetry`. The `gps` block is
 * present on every tick; the `telemetry` (health) block is present when the
 * device has fresh health/battery data to report (it may be omitted on
 * ticks that are purely positional, e.g. a fast GPS-only heartbeat).
 *
 * Example:
 * {
 *   "device_id": "edgebox-042",
 *   "asset_id": "vehicle-042",
 *   "org_id": "org-chennai-pilot",
 *   "fleet_id": "fleet-north",
 *   "ts": "2026-07-08T10:15:30.000Z",
 *   "gps": { "lat": 13.0827, "lng": 80.2707, "heading": 87.5, "speed_kmh": 42.1 },
 *   "telemetry": { "battery_pct": 76, "engine_temp_c": 91.2, "fuel_pct": 54, "health_score": 88 }
 * }
 *
 * Field notes:
 * - `device_id`: physical Edge Box hardware identifier (not necessarily the
 *   same as the logical `asset_id` it's bolted to — a box can be swapped
 *   between vehicles).
 * - `asset_id`: the logical Asset this reading belongs to (matches
 *   `asset-contracts`' `Asset.id`).
 * - `ts`: ISO 8601 timestamp of when the reading was taken on-device.
 * - `gps.heading`: degrees, 0-360, compass bearing. Optional (unavailable
 *   when the device hasn't got a heading fix yet, e.g. stationary cold
 *   start).
 * - `gps.speed_kmh`: optional, km/h.
 * - `telemetry.health_score`: optional 0-100 pre-computed on-device health
 *   score. If absent, a downstream health-scoring service (ai-engine,
 *   Phase 5) is expected to compute it later — this plugin does not invent
 *   a score.
 */
export interface RawEdgeBoxPayload {
  device_id: string;
  asset_id: string;
  org_id: string;
  fleet_id: string;
  ts: string;
  gps?: {
    lat: number;
    lng: number;
    heading?: number;
    speed_kmh?: number;
  };
  telemetry?: {
    battery_pct?: number;
    engine_temp_c?: number;
    fuel_pct?: number;
    odometer_km?: number;
    health_score?: number;
  };
}
