"use client";

import React, { useState } from "react";
import type { FormEvent } from "react";
import { Badge, Button, Card } from "@gamopls/ui";
import type { BadgeTone } from "@gamopls/ui";
import { TASK_STATUS_FORWARD_FLOW } from "./types";
import type { Mission, Task, TaskStatus } from "./types";
import { Input } from "../ui/input";
import { UserCheck, CheckCircle2, ShieldAlert } from "lucide-react";

const STATUS_TONE: Record<TaskStatus, BadgeTone> = {
  draft: "warning",
  open: "info",
  in_progress: "info",
  done: "success",
  cancelled: "neutral",
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
    <Card className="border border-border bg-card/60 p-5 hover:bg-card hover:border-muted-foreground/20 transition-all duration-200">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h4 className="font-bold text-foreground text-base leading-snug">{task.title}</h4>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{task.description}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {isDraft && (
            <Badge tone="warning" style={{ fontSize: "10px" }}>
              AI Suggested
            </Badge>
          )}
          <Badge tone={STATUS_TONE[task.status]} style={{ fontSize: "10px" }}>
            {task.status.replace("_", " ")}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-b border-border/40 py-3 my-3 text-xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">Mission scope</span>
          <span className="text-foreground font-medium">{mission ? mission.title : task.mission_id ?? "— unassigned —"}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">Assigned machine</span>
          <span className="text-foreground font-mono">{task.asset_id ?? "— unassigned —"}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mt-4 pt-1">
        <div className="flex flex-wrap gap-2 items-center">
          {next && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => onAdvanceStatus(task.id, next))}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Mark as {next.replace("_", " ")}
            </Button>
          )}
          {task.status !== "cancelled" && task.status !== "done" && (
            <Button 
              variant="ghost" 
              disabled={busy} 
              onClick={() => run(() => onSetStatus(task.id, "cancelled"))}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
            >
              Cancel
            </Button>
          )}
        </div>

        <form onSubmit={handleAssignSubmit} className="flex items-center gap-2">
          <Input
            id={`assign-${task.id}`}
            aria-label={`Asset id for ${task.title}`}
            value={assetInput}
            onChange={(e) => setAssetInput(e.target.value)}
            placeholder="asset-id"
            className="h-8 text-xs bg-background/50 border-border w-28"
          />
          <Button 
            type="submit" 
            variant="secondary" 
            disabled={busy}
            style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
          >
            <UserCheck className="h-3.5 w-3.5 mr-1" />
            Assign
          </Button>
        </form>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg mt-3">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </Card>
  );
}
