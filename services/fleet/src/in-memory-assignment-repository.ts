import { randomUUID } from "node:crypto";
import type { AssignmentRepository } from "./assignment-repository.js";
import type { DriverAssignment } from "./types.js";

export class InMemoryAssignmentRepository implements AssignmentRepository {
  private readonly rows: DriverAssignment[] = [];

  async assign(org_id: string, fleet_id: string, asset_id: string, driver_id: string): Promise<DriverAssignment> {
    await this.unassignCurrent(org_id, fleet_id, asset_id);
    const record: DriverAssignment = {
      id: randomUUID(),
      org_id,
      fleet_id,
      asset_id,
      driver_id,
      assigned_at: new Date().toISOString(),
      unassigned_at: null,
    };
    this.rows.push(record);
    return record;
  }

  async unassignCurrent(org_id: string, fleet_id: string, asset_id: string): Promise<DriverAssignment | null> {
    const open = this.rows.find(
      (a) => a.org_id === org_id && a.fleet_id === fleet_id && a.asset_id === asset_id && a.unassigned_at === null,
    );
    if (!open) return null;
    open.unassigned_at = new Date().toISOString();
    return open;
  }

  async history(org_id: string, fleet_id: string, asset_id: string): Promise<DriverAssignment[]> {
    return this.rows
      .filter((a) => a.org_id === org_id && a.fleet_id === fleet_id && a.asset_id === asset_id)
      .sort((a, b) => b.assigned_at.localeCompare(a.assigned_at));
  }
}
