import type { MaintenanceRecord } from "./maintenance-record.js";
import type { CreateMaintenanceRecordInput } from "./schemas.js";

export interface MaintenanceRecordRepository {
  create(input: CreateMaintenanceRecordInput): Promise<MaintenanceRecord>;
  list(assetId: string): Promise<MaintenanceRecord[]>;
}
