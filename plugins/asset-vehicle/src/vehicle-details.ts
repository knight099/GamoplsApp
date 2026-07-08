/**
 * VehicleDetails — trip/plate/fuel data owned ENTIRELY by this plugin.
 *
 * CRITICAL ARCHITECTURE RULE (CLAUDE.md): trip-specific data belongs here,
 * referenced by `asset_id` only. It must never be joined into or duplicated
 * in services/board's Mission/Task tables (asset-type-agnostic by design).
 * services/board only ever sees the shared `Taskable.assignedTaskId` pointer
 * going the other direction — it has zero knowledge this table exists.
 */
export type FuelType = "petrol" | "diesel" | "electric" | "hybrid" | "cng";

export interface TripLeg {
  /** ISO 8601 timestamp trip leg started. */
  startedAt: string;
  /** ISO 8601 timestamp trip leg ended, null if in progress. */
  endedAt: string | null;
  originLabel: string;
  destinationLabel: string;
  distanceKm: number | null;
}

export interface VehicleDetails {
  /** FK to Asset.id — the only linkage back to the shared contract. Never a join key on board's tables. */
  assetId: string;

  plateNumber: string;
  vehicleType: "truck" | "van" | "car" | "bike" | "bus" | "other";
  make: string | null;
  model: string | null;
  fuelType: FuelType;
  fuelCapacityLiters: number | null;
  odometerKm: number;

  /** Current/most recent trip leg, if any. Historical legs are out of scope for V1 (single-row snapshot). */
  currentTrip: TripLeg | null;

  createdAt: string;
  updatedAt: string;
}
