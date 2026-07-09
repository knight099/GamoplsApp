import { randomUUID } from "node:crypto";
import type { MaintenanceRecord } from "./maintenance-record.js";
import type { MaintenanceRecordRepository } from "./maintenance-record-repository.js";
import type { CreateMaintenanceRecordInput } from "./schemas.js";

export class InMemoryMaintenanceRecordRepository implements MaintenanceRecordRepository {
  private readonly rows: MaintenanceRecord[] = [];

  async create(input: CreateMaintenanceRecordInput): Promise<MaintenanceRecord> {
    const record: MaintenanceRecord = {
      id: randomUUID(),
      assetId: input.assetId,
      serviceType: input.serviceType,
      performedAt: input.performedAt,
      odometerAtServiceKm: input.odometerAtServiceKm,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(record);
    return record;
  }

  async list(assetId: string): Promise<MaintenanceRecord[]> {
    return this.rows
      .filter((r) => r.assetId === assetId)
      .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  }
}
