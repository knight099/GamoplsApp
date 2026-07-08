import { z } from "zod";

/** REST request-body schemas — separate from the domain types in types.ts. */

export const createChannelBodySchema = z.object({
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
  mission_id: z.string().min(1),
  name: z.string().min(1),
});

export const updateChannelBodySchema = z.object({
  name: z.string().min(1).optional(),
});

export const mediaReferenceSchema = z.object({
  url: z.string().min(1),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().nonnegative(),
});

export const createMessageBodySchema = z.object({
  senderType: z.enum(["user", "system"]).default("user"),
  senderId: z.string().min(1),
  body: z.string().min(1),
  assetId: z.string().min(1).optional(),
  media: mediaReferenceSchema.optional(),
});

export const updateMessageBodySchema = z.object({
  body: z.string().min(1).optional(),
});
