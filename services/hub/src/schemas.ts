import { z } from "zod";

/**
 * Upload request body.
 *
 * Storage design choice (V1, Chennai pilot): the client sends the file
 * inline as base64 in `content`, OR — if the file was already uploaded
 * to a blob store out-of-band (e.g. a pre-signed URL flow driven by
 * `apps/web`) — a `blobUrl` pointing at it. Exactly one of the two must
 * be present. This avoids pulling in multipart/form-data handling for
 * V1 while still leaving room for a "big file, pre-uploaded" path.
 *
 * NOTE: `org_id`/`fleet_id` are deliberately NOT part of this schema.
 * Per apps/web's gateway contract (see gateway-proxy.ts), the BFF only
 * forces org_id/fleet_id as query-string params, not JSON body fields —
 * a body-supplied org_id/fleet_id would let a client smuggle a different
 * tenant into the write path. The route handler reads tenant scope from
 * `uploadDocumentQuerySchema` (query params) instead, same as the read
 * endpoints below.
 */
export const uploadDocumentRequestSchema = z
  .object({
    filename: z.string().min(1),
    mimeType: z.string().min(1),
    uploader: z.string().min(1),
    description: z.string().optional(),
    tags: z.array(z.string().min(1)).optional(),
    /** Base64-encoded file content. Mutually exclusive with `blobUrl`. */
    content: z.string().min(1).optional(),
    /** Pointer to a pre-uploaded blob. Mutually exclusive with `content`. */
    blobUrl: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.content) !== Boolean(data.blobUrl), {
    message: "exactly one of `content` (base64) or `blobUrl` must be provided",
  });

export type UploadDocumentRequest = z.infer<typeof uploadDocumentRequestSchema>;

/** Tenant scope for the upload endpoint, sourced from query params (see note above). */
export const uploadDocumentQuerySchema = z.object({
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
});

/**
 * Stored document metadata. `storageLocation` is an opaque locator
 * (local file path today, could be an S3/GCS key or URL later) — callers
 * of the repository never need to know which storage backend produced it.
 */
export interface DocumentMetadata {
  id: string;
  org_id: string;
  fleet_id: string;
  filename: string;
  mimeType: string;
  size: number;
  uploader: string;
  description?: string;
  tags: string[];
  storageLocation: string;
  createdAt: string;
}

export const listDocumentsQuerySchema = z.object({
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1),
  org_id: z.string().min(1),
  fleet_id: z.string().min(1),
});
