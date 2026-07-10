"use client";

import React, { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@gamopls/ui";
import { Input } from "../ui/input";
import { Plus, ShieldAlert } from "lucide-react";

export interface MissionFormProps {
  onSubmit: (input: { title: string; description: string }) => Promise<void>;
}

export function MissionForm({ onSubmit }: MissionFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), description });
      setTitle("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create mission");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-primary" />
        New mission
      </h3>
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Title
        </label>
        <Input
          aria-label="Mission title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Operation Deep Scan"
          className="h-8 text-xs bg-background/50 border-border"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Description
        </label>
        <textarea
          aria-label="Mission description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Detailed mission objectives..."
          className="w-full text-xs bg-background/50 border border-border rounded-md p-2 text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      {error && (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button 
        type="submit" 
        disabled={submitting || !title.trim()}
        style={{ width: "100%", padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}
      >
        {submitting ? "Creating…" : "Create mission"}
      </Button>
    </form>
  );
}
