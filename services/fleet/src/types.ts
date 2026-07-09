import { z } from "zod";

export const fleetSchema = z.object({
  id: z.string().min(1),
  org_id: z.string().min(1),
  name: z.string().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Fleet = z.infer<typeof fleetSchema>;

export const createFleetInputSchema = z.object({
  org_id: z.string().min(1),
  name: z.string().min(1),
});
export type CreateFleetInput = z.infer<typeof createFleetInputSchema>;

export const driverStatusSchema = z.enum(["active", "inactive"]);

export const driverSchema = z.object({
  id: z.string().min(1),
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().nullable(),
  license_number: z.string().nullable(),
  status: driverStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Driver = z.infer<typeof driverSchema>;

export const createDriverInputSchema = z.object({
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(1).nullable().default(null),
  license_number: z.string().min(1).nullable().default(null),
});
export type CreateDriverInput = z.infer<typeof createDriverInputSchema>;

export const updateDriverInputSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).nullable().optional(),
  license_number: z.string().min(1).nullable().optional(),
  status: driverStatusSchema.optional(),
});
export type UpdateDriverInput = z.infer<typeof updateDriverInputSchema>;

export const assetSchema = z.object({
  id: z.string().min(1),
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  type: z.string().min(1),
  display_label: z.string().min(1),
  health_score: z.number().min(0).max(100),
  telemetry: z.record(z.string(), z.unknown()),
  telemetry_updated_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Asset = z.infer<typeof assetSchema>;

/** Vehicle-specific fields, entered once at onboarding, forwarded to plugins/asset-vehicle — never stored here. */
export const createVehicleAssetInputSchema = z.object({
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  plateNumber: z.string().min(1),
  vehicleType: z.enum(["truck", "van", "car", "bike", "bus", "other"]),
  fuelType: z.enum(["petrol", "diesel", "electric", "hybrid", "cng"]),
  make: z.string().min(1).nullable().default(null),
  model: z.string().min(1).nullable().default(null),
  color: z.string().min(1).nullable().default(null),
  year: z.string().min(1).nullable().default(null),
  vin: z.string().min(1).nullable().default(null),
  fuelCapacityLiters: z.number().positive().nullable().default(null),
  odometerKm: z.number().min(0).default(0),
});
export type CreateVehicleAssetInput = z.infer<typeof createVehicleAssetInputSchema>;

export const driverAssignmentSchema = z.object({
  id: z.string().min(1),
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  asset_id: z.string().min(1),
  driver_id: z.string().min(1),
  assigned_at: z.string().datetime(),
  unassigned_at: z.string().datetime().nullable(),
});
export type DriverAssignment = z.infer<typeof driverAssignmentSchema>;

export const assignDriverInputSchema = z.object({
  driver_id: z.string().min(1),
});
export type AssignDriverInput = z.infer<typeof assignDriverInputSchema>;
