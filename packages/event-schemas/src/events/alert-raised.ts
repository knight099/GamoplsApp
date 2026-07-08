import { z } from "zod";
import { baseEventSchema } from "../common.js";

export const ALERT_RAISED = "AlertRaised" as const;

export const alertSeveritySchema = z.enum(["info", "warning", "critical"]);

export const alertRaisedSchema = baseEventSchema.extend({
  type: z.literal(ALERT_RAISED),
  asset_id: z.string().min(1),
  severity: alertSeveritySchema,
  /** Machine-readable reason code, e.g. "geofence_exit", "health_threshold_breach". */
  reason: z.string().min(1),
  /** Human-readable message, e.g. for display in a chat system message. */
  message: z.string().min(1),
});

export type AlertRaised = z.infer<typeof alertRaisedSchema>;
