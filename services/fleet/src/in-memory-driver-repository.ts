import { randomUUID } from "node:crypto";
import type { DriverRepository } from "./driver-repository.js";
import type { CreateDriverInput, Driver, UpdateDriverInput } from "./types.js";

export class InMemoryDriverRepository implements DriverRepository {
  private readonly rows: Driver[] = [];

  async create(input: CreateDriverInput): Promise<Driver> {
    const now = new Date().toISOString();
    const driver: Driver = {
      id: randomUUID(),
      org_id: input.org_id,
      fleet_id: input.fleet_id,
      name: input.name,
      phone: input.phone,
      license_number: input.license_number,
      status: "active",
      created_at: now,
      updated_at: now,
    };
    this.rows.push(driver);
    return driver;
  }

  async get(id: string, org_id: string, fleet_id: string): Promise<Driver | null> {
    return this.rows.find((d) => d.id === id && d.org_id === org_id && d.fleet_id === fleet_id) ?? null;
  }

  async list(org_id: string, fleet_id: string): Promise<Driver[]> {
    return this.rows.filter((d) => d.org_id === org_id && d.fleet_id === fleet_id);
  }

  async update(id: string, org_id: string, fleet_id: string, patch: UpdateDriverInput): Promise<Driver | null> {
    const idx = this.rows.findIndex((d) => d.id === id && d.org_id === org_id && d.fleet_id === fleet_id);
    if (idx === -1) return null;
    this.rows[idx] = { ...this.rows[idx], ...patch, updated_at: new Date().toISOString() };
    return this.rows[idx];
  }
}
