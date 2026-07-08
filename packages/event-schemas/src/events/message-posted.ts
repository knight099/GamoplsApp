import { z } from "zod";
import { baseEventSchema } from "../common.js";

export const MESSAGE_POSTED = "MessagePosted" as const;

export const messagePostedSchema = baseEventSchema.extend({
  type: z.literal(MESSAGE_POSTED),
  mission_channel_id: z.string().min(1),
  /** Present when the message is about/attached to a specific asset (e.g. an alert-triggered system message). */
  asset_id: z.string().min(1).optional(),
  author_id: z.string().min(1),
  body: z.string().min(1),
});

export type MessagePosted = z.infer<typeof messagePostedSchema>;
