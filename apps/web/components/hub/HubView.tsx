"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Spinner } from "@gamopls/ui";
import { HubApiError, listDocuments } from "./api";
import { DocumentTable } from "./DocumentTable";
import { SearchPanel } from "./SearchPanel";
import { UploadForm } from "./UploadForm";
import type { HubDocument } from "./types";
import { AlertCircle, RefreshCw, Folder } from "lucide-react";

export interface HubViewProps {
  uploaderId: string;
}

type LoadState = "loading" | "error" | "ready";

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

  if (state === "loading" && documents.length === 0) {
    return (
      <div className="flex justify-center items-center py-24">
        <Spinner size={32} label="Loading documents" />
      </div>
    );
  }

  if (state === "error" && documents.length === 0) {
    return (
      <Card className="border border-border bg-card p-6 text-center max-w-lg mx-auto mt-12 space-y-4">
        <div className="flex justify-center">
          <AlertCircle className="h-12 w-12 text-rose-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Hub Index Failure</h2>
        <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">{error}</p>
        <button 
          onClick={() => void loadDocuments()} 
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" />
          Retry Sync
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-border/50 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Store, catalog, and query fleet technical files and checklists.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UploadForm
          uploaderId={uploaderId}
          onUploaded={(created) => setDocuments((prev) => [created, ...prev])}
        />
        <SearchPanel />
      </div>

      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-white mb-4 border-b border-border/50 pb-2 flex items-center gap-2">
          <Folder className="h-5 w-5 text-cyan-400" />
          Documents
        </h2>
        
        <DocumentTable documents={documents} />
      </Card>
    </div>
  );
}
