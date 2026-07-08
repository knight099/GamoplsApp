"use client";

// See BoardView.tsx for why React is imported explicitly here (classic JSX
// transform under vitest, per apps/web's Next-oriented tsconfig).
import React, { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@gamopls/ui";

export interface MissionFormProps {
  onSubmit: (input: { title: string; description: string }) => Promise<void>;
}

/** Create-mission form: title + description only — Missions are generic
 * containers for Tasks, nothing asset-specific belongs here. */
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
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <h3 style={{ margin: 0 }}>New mission</h3>
      <label style={{ display: "flex", flexDirection: "column", fontSize: "0.875rem", gap: "0.25rem" }}>
        Title
        <input
          aria-label="Mission title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: "0.375rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", fontSize: "0.875rem", gap: "0.25rem" }}>
        Description
        <textarea
          aria-label="Mission description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ padding: "0.375rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
        />
      </label>
      {error && <p style={{ color: "#991b1b", fontSize: "0.875rem", margin: 0 }}>{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create mission"}
      </Button>
    </form>
  );
}
