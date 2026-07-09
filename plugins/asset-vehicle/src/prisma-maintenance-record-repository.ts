import type { PrismaClient } from "@gamopls/db";
import type { MaintenanceRecord } from "./maintenance-record.js";
import type { MaintenanceRecordRepository } from "./maintenance-record-repository.js";
import type { CreateMaintenanceRecordInput } from "./schemas.js";

export class PrismaMaintenanceRecordRepository implements MaintenanceRecordRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private map(db: any): MaintenanceRecord {
    return {
      id: db.id,
      assetId: db.asset_id,
      serviceType: db.service_type,
      performedAt: db.performed_at.toISOString(),
      odometerAtServiceKm: Number(db.odometer_at_service_km),
      createdAt: db.created_at.toISOString(),
    };
  }

  async create(input: CreateMaintenanceRecordInput): Promise<MaintenanceRecord> {
    const db = await this.prisma.maintenanceRecord.create({
      data: {
        asset_id: input.assetId,
        service_type: input.serviceType,
        performed_at: new Date(input.performedAt),
        odometer_at_service_km: input.odometerAtServiceKm,
      },
    });
    return this.map(db);
  }

  async list(assetId: string): Promise<MaintenanceRecord[]> {
    const rows = await this.prisma.maintenanceRecord.findMany({
      where: { asset_id: assetId },
      orderBy: { performed_at: "desc" },
    });
    return rows.map((r: any) => this.map(r));
  }
}
