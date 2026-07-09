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
