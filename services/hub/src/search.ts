import type { DocumentRepository } from "./repository.js";

export interface SearchResult {
  documentId: string;
  filename: string;
  /** Relative relevance, higher is more relevant. Not calibrated across providers. */
  score: number;
  /** Short human-readable reason the document matched (e.g. which field). */
  snippet: string;
}

/**
 * RAG search port. `services/ai-engine` (Python) is expected to grow a
 * real embeddings-backed implementation of this later; hub itself never
 * knows which implementation is wired in.
 */
export interface SearchProvider {
  search(query: string, org_id: string, fleet_id: string): Promise<SearchResult[]>;
}

/**
 * V1 stub: honest substring/keyword match over document metadata
 * (filename, description, tags) — NOT semantic/embeddings-based search.
 * This exists so the API shape (`POST`/`GET /search`) and callers in
 * `apps/web` can be built against a real interface today, and swapped
 * for an ai-engine-backed `SearchProvider` later without an API change.
 */
export class KeywordSearchProvider implements SearchProvider {
  constructor(private readonly repository: DocumentRepository) {}

  async search(query: string, org_id: string, fleet_id: string): Promise<SearchResult[]> {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return [];
    }

    const documents = await this.repository.list(org_id, fleet_id);
    const results: SearchResult[] = [];

    for (const doc of documents) {
      const filenameMatch = doc.filename.toLowerCase().includes(needle);
      const descriptionMatch = doc.description?.toLowerCase().includes(needle) ?? false;
      const tagMatch = doc.tags.some((tag) => tag.toLowerCase().includes(needle));

      if (!filenameMatch && !descriptionMatch && !tagMatch) {
        continue;
      }

      // Filename matches rank highest, then tags, then description —
      // a simple, explainable heuristic, not a relevance model.
      const score = (filenameMatch ? 3 : 0) + (tagMatch ? 2 : 0) + (descriptionMatch ? 1 : 0);
      const snippet = filenameMatch
        ? `filename matches "${query}"`
        : tagMatch
          ? `tag matches "${query}"`
          : `description matches "${query}"`;

      results.push({ documentId: doc.id, filename: doc.filename, score, snippet });
    }

    return results.sort((a, b) => b.score - a.score);
  }
}
