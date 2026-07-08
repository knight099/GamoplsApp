/**
 * HUB view types — deliberately mirror services/hub/src/schemas.ts's wire
 * shapes (DocumentMetadata / SearchResult) rather than importing that
 * package directly: services/hub is a standalone deployable Fastify
 * service (per CLAUDE.md's "plugins/services are separate deployable
 * services" rule), not a library apps/web should depend on at build time.
 * Keep this in sync with services/hub/src/schemas.ts and src/search.ts if
 * those shapes ever change.
 */

export interface HubDocument {
  id: string;
  org_id: string;
  fleet_id: string;
  filename: string;
  mimeType: string;
  /** Bytes. 0 for documents uploaded via `blobUrl` (size unknown without
   * fetching the blob — see services/hub/src/build-app.ts). */
  size: number;
  uploader: string;
  description?: string;
  tags: string[];
  storageLocation: string;
  createdAt: string;
}

export interface DocumentListResponse {
  documents: HubDocument[];
}

/**
 * POST /documents body. Mirrors `uploadDocumentRequestSchema` in
 * services/hub/src/schemas.ts: exactly one of `content` (base64) or
 * `blobUrl` must be present — this view only ever sends `content`, no
 * pre-signed-upload flow exists yet in V1.
 *
 * `org_id`/`fleet_id` are deliberately NOT part of this body: the gateway
 * (apps/web/lib/gateway-proxy.ts) forces them as query params from the
 * verified JWT on every forwarded request, and services/hub's upload
 * route now reads tenant scope from those query params, not the body —
 * same trust model as every other gateway request.
 */
export interface UploadDocumentInput {
  filename: string;
  mimeType: string;
  uploader: string;
  description?: string;
  tags?: string[];
  content: string;
}

export interface HubSearchResult {
  documentId: string;
  filename: string;
  score: number;
  snippet: string;
}

export interface SearchResponse {
  results: HubSearchResult[];
}
