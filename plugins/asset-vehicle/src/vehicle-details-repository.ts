import type { VehicleDetails } from "./vehicle-details.js";
import type { CreateVehicleDetailsInput, UpdateVehicleDetailsInput } from "./schemas.js";

/**
 * Persistence port for VehicleDetails — owned entirely by this plugin
 * (CLAUDE.md: never joined into or duplicated in services/board's tables).
 * services/fleet reaches this only through the HTTP API in build-app.ts,
 * never by importing this interface or its implementations directly.
 */
export interface VehicleDetailsRepository {
  create(input: CreateVehicleDetailsInput): Promise<VehicleDetails>;
  get(assetId: string): Promise<VehicleDetails | null>;
  update(assetId: string, patch: UpdateVehicleDetailsInput): Promise<VehicleDetails | null>;
}
