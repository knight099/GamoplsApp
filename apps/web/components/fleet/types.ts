export interface Fleet {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: string;
  org_id: string;
  fleet_id: string;
  name: string;
  phone: string | null;
  license_number: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface VehicleDetails {
  assetId: string;
  plateNumber: string;
  vehicleType: "truck" | "van" | "car" | "bike" | "bus" | "other";
  fuelType: "petrol" | "diesel" | "electric" | "hybrid" | "cng";
  make: string | null;
  model: string | null;
  color: string | null;
  year: string | null;
  vin: string | null;
  fuelCapacityLiters: number | null;
  odometerKm: number;
}

export interface Asset {
  id: string;
  org_id: string;
  fleet_id: string;
  type: string;
  display_label: string;
  health_score: number;
  telemetry: Record<string, unknown>;
  telemetry_updated_at: string | null;
  last_mileage_kmpl: number | null;
  created_at: string;
  updated_at: string;
  vehicleDetails?: VehicleDetails | null;
}

export interface MaintenanceRecord {
  id: string;
  assetId: string;
  serviceType: "oil_change" | "brake_inspection" | "tire_rotation" | "general_service";
  performedAt: string;
  odometerAtServiceKm: number;
  createdAt: string;
}

export interface LogMaintenanceInput {
  serviceType: MaintenanceRecord["serviceType"];
  performedAt: string;
  odometerAtServiceKm: number;
}

export interface DriverAssignment {
  id: string;
  org_id: string;
  fleet_id: string;
  asset_id: string;
  driver_id: string;
  assigned_at: string;
  unassigned_at: string | null;
}

export interface CreateVehicleInput {
  plateNumber: string;
  vehicleType: VehicleDetails["vehicleType"];
  fuelType: VehicleDetails["fuelType"];
  make?: string | null;
  model?: string | null;
  color?: string | null;
  year?: string | null;
  vin?: string | null;
}

export interface CreateDriverInput {
  name: string;
  phone?: string | null;
  license_number?: string | null;
}
