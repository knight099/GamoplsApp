import { randomUUID } from "node:crypto";
import type { FleetRepository } from "./fleet-repository.js";
import type { CreateFleetInput, Fleet } from "./types.js";

export class InMemoryFleetRepository implements FleetRepository {
  private readonly rows: Fleet[] = [];

  async create(input: CreateFleetInput): Promise<Fleet> {
    const now = new Date().toISOString();
    const fleet: Fleet = { id: randomUUID(), org_id: input.org_id, name: input.name, created_at: now, updated_at: now };
    this.rows.push(fleet);
    return fleet;
  }

  async list(org_id: string): Promise<Fleet[]> {
    return this.rows.filter((f) => f.org_id === org_id);
  }
}
