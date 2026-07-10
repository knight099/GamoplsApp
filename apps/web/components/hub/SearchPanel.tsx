"use client";

import { useState, type FormEvent } from "react";
import { Button, Card, Spinner } from "@gamopls/ui";
import { HubApiError, searchDocuments } from "./api";
import type { HubSearchResult } from "./types";
import { Input } from "../ui/input";
import { Search, ShieldAlert, FileText } from "lucide-react";

type SearchState = "idle" | "loading" | "error" | "ready";

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
    <Card className="border border-border bg-card p-6">
      <h2 className="text-lg font-bold text-foreground mb-2 flex items-center gap-1.5">
        <Search className="h-5 w-5 text-primary" />
        Search documents
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Matches filename, description, and tags by keyword.
      </p>
      
      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <Input
          type="text"
          aria-label="Search documents"
          placeholder="Filter documents by tag, name or content keywords..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="bg-background/50 border-border flex-1 h-10"
        />
        <Button type="submit" disabled={state === "loading" || !query.trim()} style={{ height: "2.5rem" }}>
          Search
        </Button>
      </form>

      {state === "loading" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 justify-center">
          <Spinner size={14} label="Searching" />
          <span>Searching index...</span>
        </div>
      )}

      {state === "error" && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {state === "ready" && results.length === 0 && (
        <p className="text-xs text-muted-foreground py-2 text-center border border-dashed border-border rounded-lg">
          No matching records discovered.
        </p>
      )}

      {state === "ready" && results.length > 0 && (
        <ul className="divide-y divide-border/40 mt-4 border border-border rounded-lg overflow-hidden bg-background/20">
          {results.map((result) => (
            <li
              key={result.documentId}
              className="p-3 hover:bg-background/40 transition-colors flex gap-3 items-start"
            >
              <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <strong className="text-xs font-bold text-foreground block">{result.filename}</strong>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed truncate">{result.snippet}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
