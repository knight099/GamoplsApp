"use client";

import React, { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@gamopls/ui";
import { Input } from "../ui/input";
import type { Mission } from "./types";
import { Plus, ShieldAlert } from "lucide-react";

export interface TaskFormProps {
  missions: Mission[];
  defaultMissionId?: string;
  onSubmit: (input: {
    title: string;
    description: string;
    mission_id: string | null;
    asset_id: string | null;
  }) => Promise<void>;
}

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
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-primary" />
        New task
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Title
          </label>
          <Input
            aria-label="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Inspect Sensor Grid"
            className="h-8 text-xs bg-background/50 border-border"
          />
        </div>
        
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Asset ID (optional)
          </label>
          <Input
            aria-label="Asset id"
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            placeholder="e.g. box-chennai-01"
            className="h-8 text-xs bg-background/50 border-border"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Mission Scope
          </label>
          <select
            aria-label="Mission"
            value={missionId}
            onChange={(e) => setMissionId(e.target.value)}
            className="w-full h-8 px-2 rounded-md bg-background/50 border border-border text-xs text-foreground focus-visible:outline-none"
          >
            <option value="">Unassigned (draft)</option>
            {missions.map((mission) => (
              <option key={mission.id} value={mission.id}>
                {mission.title}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Description
          </label>
          <Input
            aria-label="Task description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Objectives..."
            className="h-8 text-xs bg-background/50 border-border"
          />
        </div>
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
        {submitting ? "Creating…" : "Create task"}
      </Button>
    </form>
  );
}
