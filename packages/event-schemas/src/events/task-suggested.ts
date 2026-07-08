import { z } from "zod";
import { baseEventSchema } from "../common.js";

export const TASK_SUGGESTED = "TaskSuggested" as const;

export const taskSuggestedSchema = baseEventSchema.extend({
  type: z.literal(TASK_SUGGESTED),
  /** The Taskable asset this suggestion is for. */
  asset_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  /** What produced the suggestion, e.g. "ai-engine.health-score". */
  source: z.string().min(1),
});

export type TaskSuggested = z.infer<typeof taskSuggestedSchema>;
