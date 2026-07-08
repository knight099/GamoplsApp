"use client";

import { useState, type FormEvent } from "react";
import { Button, Card, Spinner } from "@gamopls/ui";
import { HubApiError, searchDocuments } from "./api";
import type { HubSearchResult } from "./types";

type SearchState = "idle" | "loading" | "error" | "ready";

/**
 * Document search (PLAN.md 6.7). Calls `GET /api/hub/search?q=...`.
 * services/hub's search (KeywordSearchProvider, see
 * services/hub/src/search.ts) is an honest keyword/substring match over
 * filename/description/tags — NOT semantic/RAG search yet, so the copy
 * here says exactly that rather than implying AI-powered search.
 */
export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [results, setResults] = useState<HubSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setState("loading");
    setError(null);
    try {
      const found = await searchDocuments(trimmed);
      setResults(found);
      setState("ready");
    } catch (err) {
      setError(err instanceof HubApiError ? err.message : "Search failed.");
      setState("error");
    }
  }

  return (
    <Card>
      <h2 style={{ marginTop: 0 }}>Search documents</h2>
      <p style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: 0 }}>
        Matches filename, description, and tags by keyword.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          aria-label="Search documents"
          placeholder="Search documents…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ flex: 1 }}
        />
        <Button type="submit" disabled={state === "loading"}>
          Search
        </Button>
      </form>

      {state === "loading" && <Spinner label="Searching" />}

      {state === "error" && (
        <p role="alert" style={{ color: "#991b1b" }}>
          {error}
        </p>
      )}

      {state === "ready" && results.length === 0 && (
        <p style={{ color: "#6b7280" }}>No matching documents.</p>
      )}

      {state === "ready" && results.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {results.map((result) => (
            <li
              key={result.documentId}
              style={{ padding: "0.5rem 0", borderBottom: "1px solid #f3f4f6" }}
            >
              <strong>{result.filename}</strong>
              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{result.snippet}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
