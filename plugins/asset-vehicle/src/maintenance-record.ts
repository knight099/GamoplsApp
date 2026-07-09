export type ServiceType = "oil_change" | "brake_inspection" | "tire_rotation" | "general_service";

export interface MaintenanceRecord {
  id: string;
  assetId: string;
  serviceType: ServiceType;
  performedAt: string;
  odometerAtServiceKm: number;
  createdAt: string;
}
