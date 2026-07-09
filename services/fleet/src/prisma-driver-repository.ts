import type { PrismaClient } from "@gamopls/db";
import type { DriverRepository } from "./driver-repository.js";
import type { CreateDriverInput, Driver, UpdateDriverInput } from "./types.js";

export class PrismaDriverRepository implements DriverRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(db: any): Driver {
    return {
      id: db.id,
      org_id: db.org_id,
      fleet_id: db.fleet_id,
      name: db.name,
      phone: db.phone,
      license_number: db.license_number,
      status: db.status,
      created_at: db.created_at.toISOString(),
      updated_at: db.updated_at.toISOString(),
    };
  }

  async create(input: CreateDriverInput): Promise<Driver> {
    const db = await this.prisma.driver.create({
      data: {
        org_id: input.org_id,
        fleet_id: input.fleet_id,
        name: input.name,
        phone: input.phone,
        license_number: input.license_number,
      },
    });
    return this.map(db);
  }

  async get(id: string, org_id: string, fleet_id: string): Promise<Driver | null> {
    const db = await this.prisma.driver.findFirst({ where: { id, org_id, fleet_id } });
    return db ? this.map(db) : null;
  }

  async list(org_id: string, fleet_id: string): Promise<Driver[]> {
    const rows = await this.prisma.driver.findMany({ where: { org_id, fleet_id }, orderBy: { created_at: "desc" } });
    return rows.map((r: any) => this.map(r));
  }

  async update(id: string, org_id: string, fleet_id: string, patch: UpdateDriverInput): Promise<Driver | null> {
    const existing = await this.prisma.driver.findFirst({ where: { id, org_id, fleet_id } });
    if (!existing) return null;
    const db = await this.prisma.driver.update({ where: { id }, data: patch });
    return this.map(db);
  }
}
