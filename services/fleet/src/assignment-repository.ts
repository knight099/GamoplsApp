import type { DriverAssignment } from "./types.js";

export interface AssignmentRepository {
  /** Closes any open assignment for `asset_id`, then creates a new open one for `driver_id`. */
  assign(org_id: string, fleet_id: string, asset_id: string, driver_id: string): Promise<DriverAssignment>;
  /** Closes the open assignment for `asset_id`, if any. Returns it, or null if none was open. */
  unassignCurrent(org_id: string, fleet_id: string, asset_id: string): Promise<DriverAssignment | null>;
  history(org_id: string, fleet_id: string, asset_id: string): Promise<DriverAssignment[]>;
}
