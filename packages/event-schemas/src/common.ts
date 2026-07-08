import { z } from "zod";

/**
 * Fields every event in this repo must carry, per CLAUDE.md's
 * multi-tenancy rule: every request/event is scoped by org_id/fleet_id.
 */
export const baseEventSchema = z.object({
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  /** ISO 8601 timestamp of when the event occurred (not when it was published). */
  timestamp: z.string().datetime(),
});

export type BaseEvent = z.infer<typeof baseEventSchema>;
