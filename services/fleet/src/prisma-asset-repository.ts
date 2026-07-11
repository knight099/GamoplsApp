import type { Prisma, PrismaClient } from "@gamopls/db";
import type { AssetRepository, CreateAssetInput } from "./asset-repository.js";
import type { Asset } from "./types.js";

export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(db: any): Asset {
    return {
      id: db.id,
      org_id: db.org_id,
      fleet_id: db.fleet_id,
      type: db.type,
      display_label: db.display_label,
      health_score: db.health_score,
      telemetry: db.telemetry as Record<string, unknown>,
      telemetry_updated_at: db.telemetry_updated_at ? db.telemetry_updated_at.toISOString() : null,
      last_mileage_kmpl: db.last_mileage_kmpl === null ? null : Number(db.last_mileage_kmpl),
      created_at: db.created_at.toISOString(),
      updated_at: db.updated_at.toISOString(),
    };
  }

  async create(input: CreateAssetInput): Promise<Asset> {
    const db = await this.prisma.asset.create({
      data: {
        org_id: input.org_id,
        fleet_id: input.fleet_id,
        type: input.type,
        display_label: input.display_label,
      },
    });
    return this.map(db);
  }

  async get(id: string, org_id: string, fleet_id: string): Promise<Asset | null> {
    const db = await this.prisma.asset.findFirst({ where: { id, org_id, fleet_id } });
    return db ? this.map(db) : null;
  }

  async list(org_id: string, fleet_id: string): Promise<Asset[]> {
    const rows = await this.prisma.asset.findMany({ where: { org_id, fleet_id }, orderBy: { created_at: "desc" } });
    return rows.map((r: any) => this.map(r));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.asset.delete({ where: { id } }).catch(() => undefined);
  }

  async updateHealth(id: string, health_score: number, telemetry: Record<string, unknown>): Promise<void> {
    await this.prisma.asset.update({
      where: { id },
      data: {
        health_score,
        telemetry: telemetry as Prisma.InputJsonValue,
        telemetry_updated_at: new Date(),
      },
    });
  }

  async updateMileage(id: string, last_mileage_kmpl: number | null): Promise<void> {
    await this.prisma.asset.update({ where: { id }, data: { last_mileage_kmpl } });
  }
}
