"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Spinner } from "@gamopls/ui";
import { HubApiError, listDocuments } from "./api";
import { DocumentTable } from "./DocumentTable";
import { SearchPanel } from "./SearchPanel";
import { UploadForm } from "./UploadForm";
import type { HubDocument } from "./types";

export interface HubViewProps {
  uploaderId: string;
}

type LoadState = "loading" | "error" | "ready";

/**
 * HUB view client shell (PLAN.md 6.7): document list, upload form, and
 * keyword search, all against `/api/hub/...` per the gateway contract in
 * apps/web/lib/gateway-proxy.ts — this component tree never fetches
 * services/hub directly.
 */
export function HubView({ uploaderId }: HubViewProps) {
  const [documents, setDocuments] = useState<HubDocument[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const docs = await listDocuments();
      setDocuments(docs);
      setState("ready");
    } catch (err) {
      setError(err instanceof HubApiError ? err.message : "Failed to load documents.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h1 style={{ margin: 0 }}>Hub</h1>

      <UploadForm
        uploaderId={uploaderId}
        onUploaded={(created) => setDocuments((prev) => [created, ...prev])}
      />

      <SearchPanel />

      <Card>
        <h2 style={{ marginTop: 0 }}>Documents</h2>
        {state === "loading" && documents.length === 0 ? (
          <Spinner label="Loading documents" />
        ) : state === "error" && documents.length === 0 ? (
          <p role="alert" style={{ color: "#991b1b" }}>
            {error}
          </p>
        ) : (
          <DocumentTable documents={documents} />
        )}
      </Card>
    </div>
  );
}
