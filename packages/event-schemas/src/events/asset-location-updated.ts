import { z } from "zod";
import { baseEventSchema } from "../common.js";

export const ASSET_LOCATION_UPDATED = "AssetLocationUpdated" as const;

export const assetLocationUpdatedSchema = baseEventSchema.extend({
  type: z.literal(ASSET_LOCATION_UPDATED),
  asset_id: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
});

export type AssetLocationUpdated = z.infer<typeof assetLocationUpdatedSchema>;
