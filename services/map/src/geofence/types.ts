import { z } from "zod";

/**
 * V1 geofence shape: a circle (center + radius). Simplest thing that
 * supports exit detection correctly (see `geofence-detector.ts`) without
 * needing a full polygon/point-in-polygon implementation; polygons can be
 * added later behind the same `GeofenceStore`/`GeofenceExitDetector`
 * interfaces if a pilot needs non-circular zones.
 *
 * A geofence is "assigned" to a single asset (`asset_id`) per the Phase
 * 4.1 spec ("exit an assigned geofence") — not fleet-wide.
 */
export const geofenceInputSchema = z.object({
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  asset_id: z.string().min(1),
  name: z.string().min(1),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  radiusMeters: z.number().positive(),
});

export type GeofenceInput = z.infer<typeof geofenceInputSchema>;

export interface Geofence extends GeofenceInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export const geofenceUpdateSchema = geofenceInputSchema.partial();
export type GeofenceUpdate = z.infer<typeof geofenceUpdateSchema>;
