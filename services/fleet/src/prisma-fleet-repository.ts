import type { PrismaClient } from "@gamopls/db";
import type { FleetRepository } from "./fleet-repository.js";
import type { CreateFleetInput, Fleet } from "./types.js";

export class PrismaFleetRepository implements FleetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(db: any): Fleet {
    return {
      id: db.id,
      org_id: db.org_id,
      name: db.name,
      created_at: db.created_at.toISOString(),
      updated_at: db.updated_at.toISOString(),
    };
  }

  async create(input: CreateFleetInput): Promise<Fleet> {
    const db = await this.prisma.fleet.create({ data: { org_id: input.org_id, name: input.name } });
    return this.map(db);
  }

  async list(org_id: string): Promise<Fleet[]> {
    const rows = await this.prisma.fleet.findMany({ where: { org_id }, orderBy: { created_at: "desc" } });
    return rows.map((r: any) => this.map(r));
  }
}
