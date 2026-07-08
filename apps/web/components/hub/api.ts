import type { DocumentListResponse, HubDocument, SearchResponse, UploadDocumentInput } from "./types";

/**
 * HUB's gateway client. Per apps/web/lib/gateway-proxy.ts's contract,
 * every request goes through `fetch('/api/hub/...')` — the Next.js route
 * handler at app/api/hub/[...path]/route.ts validates the session and
 * injects org_id/fleet_id (as query params) from the JWT before
 * forwarding to services/hub. This module NEVER fetches services/hub
 * directly.
 */

export class HubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HubApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/hub/${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `Hub request failed: ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // response body wasn't JSON — fall back to the generic message.
    }
    throw new HubApiError(message, response.status);
  }

  return (await response.json()) as T;
}

export async function listDocuments(): Promise<HubDocument[]> {
  const data = await request<DocumentListResponse>("documents");
  return data.documents;
}

export async function uploadDocument(input: UploadDocumentInput): Promise<HubDocument> {
  return request<HubDocument>("documents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function searchDocuments(query: string): Promise<SearchResponse["results"]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const data = await request<SearchResponse>(`search?q=${encodeURIComponent(trimmed)}`);
  return data.results;
}
