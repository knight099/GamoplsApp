import type { CreateFleetInput, Fleet } from "./types.js";

export interface FleetRepository {
  create(input: CreateFleetInput): Promise<Fleet>;
  list(org_id: string): Promise<Fleet[]>;
}
