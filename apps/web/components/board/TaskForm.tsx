"use client";

// See BoardView.tsx for why React is imported explicitly here (classic JSX
// transform under vitest, per apps/web's Next-oriented tsconfig).
import React, { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@gamopls/ui";
import type { Mission } from "./types";

export interface TaskFormProps {
  missions: Mission[];
  /** Preselected mission, e.g. when creating a task from within a mission's
   * detail view. Empty string means "no mission yet". */
  defaultMissionId?: string;
  onSubmit: (input: {
    title: string;
    description: string;
    mission_id: string | null;
    asset_id: string | null;
  }) => Promise<void>;
}

/**
 * Create-task form. The `asset_id` field is a plain text input, not a live
 * asset picker — wiring an autocomplete against services/map's live asset
 * list is out of scope for this V1 board view (that's a separate
 * cross-service concern), so a fleet manager types the id directly.
 */
export function TaskForm({ missions, defaultMissionId, onSubmit }: TaskFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [missionId, setMissionId] = useState(defaultMissionId ?? "");
  const [assetId, setAssetId] = useState("");
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
      await onSubmit({
        title: title.trim(),
        description,
        mission_id: missionId || null,
        asset_id: assetId.trim() || null,
      });
      setTitle("");
      setDescription("");
      setAssetId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <h3 style={{ margin: 0 }}>New task</h3>
      <label style={{ display: "flex", flexDirection: "column", fontSize: "0.875rem", gap: "0.25rem" }}>
        Title
        <input
          aria-label="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: "0.375rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", fontSize: "0.875rem", gap: "0.25rem" }}>
        Description
        <textarea
          aria-label="Task description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ padding: "0.375rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", fontSize: "0.875rem", gap: "0.25rem" }}>
        Mission
        <select
          aria-label="Mission"
          value={missionId}
          onChange={(e) => setMissionId(e.target.value)}
          style={{ padding: "0.375rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
        >
          <option value="">Unassigned (draft)</option>
          {missions.map((mission) => (
            <option key={mission.id} value={mission.id}>
              {mission.title}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", fontSize: "0.875rem", gap: "0.25rem" }}>
        Asset id (optional)
        <input
          aria-label="Asset id"
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          placeholder="e.g. asset-123"
          style={{ padding: "0.375rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
        />
      </label>
      {error && <p style={{ color: "#991b1b", fontSize: "0.875rem", margin: 0 }}>{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create task"}
      </Button>
    </form>
  );
}
