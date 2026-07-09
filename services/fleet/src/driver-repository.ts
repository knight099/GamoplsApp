import type { CreateDriverInput, Driver, UpdateDriverInput } from "./types.js";

export interface DriverRepository {
  create(input: CreateDriverInput): Promise<Driver>;
  get(id: string, org_id: string, fleet_id: string): Promise<Driver | null>;
  list(org_id: string, fleet_id: string): Promise<Driver[]>;
  update(id: string, org_id: string, fleet_id: string, patch: UpdateDriverInput): Promise<Driver | null>;
}
