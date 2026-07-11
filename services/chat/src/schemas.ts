import { z } from "zod";

/** REST request-body schemas — separate from the domain types in types.ts. */

/** Tenancy comes from the gateway-signed scope header (x-gamopls-scope),
 * never the body (suggestions.md S-1). */
export const createChannelBodySchema = z.object({
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
