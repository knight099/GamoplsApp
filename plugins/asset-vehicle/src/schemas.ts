import { z } from "zod";

export const fuelTypeSchema = z.enum(["petrol", "diesel", "electric", "hybrid", "cng"]);
export const vehicleTypeSchema = z.enum(["truck", "van", "car", "bike", "bus", "other"]);

export const createVehicleDetailsInputSchema = z.object({
  assetId: z.string().min(1),
  plateNumber: z.string().min(1),
  vehicleType: vehicleTypeSchema,
  fuelType: fuelTypeSchema,
  make: z.string().min(1).nullable().default(null),
  model: z.string().min(1).nullable().default(null),
  color: z.string().min(1).nullable().default(null),
  year: z.string().min(1).nullable().default(null),
  vin: z.string().min(1).nullable().default(null),
  fuelCapacityLiters: z.number().positive().nullable().default(null),
  odometerKm: z.number().min(0).default(0),
});
export type CreateVehicleDetailsInput = z.infer<typeof createVehicleDetailsInputSchema>;

export const updateVehicleDetailsInputSchema = z.object({
  odometerKm: z.number().min(0).optional(),
  color: z.string().min(1).nullable().optional(),
  year: z.string().min(1).nullable().optional(),
  vin: z.string().min(1).nullable().optional(),
  make: z.string().min(1).nullable().optional(),
  model: z.string().min(1).nullable().optional(),
});
export type UpdateVehicleDetailsInput = z.infer<typeof updateVehicleDetailsInputSchema>;

export const serviceTypeSchema = z.enum(["oil_change", "brake_inspection", "tire_rotation", "general_service"]);

export const createMaintenanceRecordInputSchema = z.object({
  assetId: z.string().min(1),
  serviceType: serviceTypeSchema,
  performedAt: z.string().datetime(),
  odometerAtServiceKm: z.number().min(0),
});
export type CreateMaintenanceRecordInput = z.infer<typeof createMaintenanceRecordInputSchema>;
