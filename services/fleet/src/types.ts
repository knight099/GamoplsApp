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
