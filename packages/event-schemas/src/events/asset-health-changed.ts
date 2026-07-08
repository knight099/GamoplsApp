import { z } from "zod";
import { baseEventSchema } from "../common.js";

export const ASSET_HEALTH_CHANGED = "AssetHealthChanged" as const;

export const assetHealthChangedSchema = baseEventSchema.extend({
  type: z.literal(ASSET_HEALTH_CHANGED),
  asset_id: z.string().min(1),
  healthScore: z.number().min(0).max(100),
  /** Plugin-defined telemetry snapshot. Consumers treat this as opaque. */
  telemetry: z.record(z.string(), z.unknown()).default({}),
});

export type AssetHealthChanged = z.infer<typeof assetHealthChangedSchema>;
