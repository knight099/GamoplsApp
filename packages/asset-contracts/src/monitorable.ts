/**
 * Role interface for assets that report a health/condition signal.
 * `telemetry` is intentionally an open bag: each Asset Type Plugin defines
 * its own telemetry fields (e.g. fuel level for vehicles, battery % for
 * drones) without requiring changes to this shared contract.
 */
export interface Monitorable {
  /** Normalized health score, 0 (failed) to 100 (fully healthy). */
  healthScore: number;
  /** Plugin-defined telemetry fields. Module services treat this as opaque. */
  telemetry: Record<string, unknown>;
  /** ISO 8601 timestamp of the last telemetry update. */
  telemetryUpdatedAt: string;
}
