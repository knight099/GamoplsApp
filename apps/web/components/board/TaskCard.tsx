"use client";

// See BoardView.tsx for why React is imported explicitly here (classic JSX
// transform under vitest, per apps/web's Next-oriented tsconfig).
import React, { useState } from "react";
import type { FormEvent } from "react";
import { Badge, Button, Card } from "@gamopls/ui";
import type { BadgeTone } from "@gamopls/ui";
import { TASK_STATUS_FORWARD_FLOW } from "./types";
import type { Mission, Task, TaskStatus } from "./types";

const STATUS_TONE: Record<TaskStatus, BadgeTone> = {
  draft: "warning",
  open: "info",
  in_progress: "info",
  done: "success",
  cancelled: "danger",
};

function nextForwardStatus(status: TaskStatus): TaskStatus | null {
  const idx = TASK_STATUS_FORWARD_FLOW.indexOf(status);
  if (idx === -1 || idx === TASK_STATUS_FORWARD_FLOW.length - 1) return null;
  return TASK_STATUS_FORWARD_FLOW[idx + 1] ?? null;
}

export interface TaskCardProps {
  task: Task;
  mission?: Mission;
  onAdvanceStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onSetStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  onAssign: (taskId: string, assetId: string | null) => Promise<void>;
}

/**
 * Renders a single Task exactly as returned by services/board — title,
 * description, status, mission_id, asset_id. No vehicle-specific fields:
 * per CLAUDE.md a Task only ever references an asset via the opaque
 * `asset_id` string, so that's all this card shows.
 */
export function TaskCard({ task, mission, onAdvanceStatus, onSetStatus, onAssign }: TaskCardProps) {
  const [assetInput, setAssetInput] = useState(task.asset_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = nextForwardStatus(task.status);
  const isDraft = task.status === "draft";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignSubmit(event: FormEvent) {
    event.preventDefault();
    await run(() => onAssign(task.id, assetInput.trim() || null));
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
        <div>
          <h4 style={{ margin: 0 }}>{task.title}</h4>
          {task.description && (
            <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>{task.description}</p>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {isDraft && <Badge tone="warning">AI Suggested</Badge>}
          <Badge tone={STATUS_TONE[task.status]}>{task.status}</Badge>
        </div>
      </div>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "0.125rem 0.5rem",
          fontSize: "0.8125rem",
          color: "#4b5563",
          margin: "0.75rem 0",
        }}
      >
        <dt>Mission</dt>
        <dd style={{ margin: 0 }}>{mission ? mission.title : task.mission_id ?? "— unassigned —"}</dd>
        <dt>Assigned asset</dt>
        <dd style={{ margin: 0 }}>{task.asset_id ?? "— unassigned —"}</dd>
      </dl>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        {next && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => run(() => onAdvanceStatus(task.id, next))}
          >
            Mark as {next.replace("_", " ")}
          </Button>
        )}
        {task.status !== "cancelled" && task.status !== "done" && (
          <Button variant="ghost" disabled={busy} onClick={() => run(() => onSetStatus(task.id, "cancelled"))}>
            Cancel
          </Button>
        )}
      </div>

      <form
        onSubmit={handleAssignSubmit}
        style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", alignItems: "center" }}
      >
        <label style={{ fontSize: "0.8125rem", color: "#4b5563" }} htmlFor={`assign-${task.id}`}>
          Reassign to asset id
        </label>
        <input
          id={`assign-${task.id}`}
          aria-label={`Asset id for ${task.title}`}
          value={assetInput}
          onChange={(e) => setAssetInput(e.target.value)}
          placeholder="asset-123"
          style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem", fontSize: "0.8125rem" }}
        />
        <Button type="submit" variant="secondary" disabled={busy}>
          Assign
        </Button>
      </form>

      {error && <p style={{ color: "#991b1b", fontSize: "0.8125rem", marginTop: "0.5rem" }}>{error}</p>}
    </Card>
  );
}
