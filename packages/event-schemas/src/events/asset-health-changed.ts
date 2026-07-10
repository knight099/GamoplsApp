import { z } from "zod";
import { baseEventSchema } from "../common.js";

export const ASSET_HEALTH_CHANGED = "AssetHealthChanged" as const;

/**
 * NATS subject for RAW device health readings, published by ingestion
 * (services/core-ingestion). Consumed ONLY by services/ai-engine, which
 * recomputes the health score and republishes the scored event on the
 * `AssetHealthChanged` subject. Module services (fleet, map, board, hub)
 * must subscribe to `AssetHealthChanged` only — never to this subject.
 *
 * The payload shape on this subject is identical to
 * `assetHealthChangedSchema`, including the `type: "AssetHealthChanged"`
 * literal — only the SUBJECT differs. Do not fork the schema.
 */
export const ASSET_HEALTH_RAW_SUBJECT = "AssetHealthRaw" as const;

export const assetHealthChangedSchema = baseEventSchema.extend({
  type: z.literal(ASSET_HEALTH_CHANGED),
  asset_id: z.string().min(1),
  healthScore: z.number().min(0).max(100),
  /** Plugin-defined telemetry snapshot. Consumers treat this as opaque. */
  telemetry: z.record(z.string(), z.unknown()).default({}),
});

export type AssetHealthChanged = z.infer<typeof assetHealthChangedSchema>;
