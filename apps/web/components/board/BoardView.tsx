"use client";

// Explicit default React import: apps/web's tsconfig sets jsx: "preserve"
// (required so Next's own compiler owns the JSX transform at build time),
// which makes vitest's esbuild fall back to the classic JSX transform for
// test runs — that transform expects `React` in module scope, unlike the
// automatic runtime `packages/ui` uses. Keeping this per-file avoids
// changing the shared apps/web/vitest.config.ts (other in-flight agents'
// suites depend on its current "node" environment).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Card, Spinner } from "@gamopls/ui";
import * as boardApi from "./api";
import { MissionForm } from "./MissionForm";
import { TaskForm } from "./TaskForm";
import { TaskCard } from "./TaskCard";
import { TASK_STATUSES } from "./types";
import type { Mission, Task, TaskStatus } from "./types";

type LoadState = "loading" | "ready" | "error";

const STATUS_FILTER_ALL = "all" as const;
const MISSION_FILTER_ALL = "all" as const;
const MISSION_FILTER_UNASSIGNED = "unassigned" as const;

/**
 * BOARD view — lists Missions and Tasks for the fleet manager to triage,
 * including 'draft' tasks auto-created from TaskSuggested events (flagged
 * with an "AI Suggested" badge, see TaskCard). All data comes from
 * services/board via the gateway (fetch('/api/board/...') only, per
 * apps/web/lib/gateway-proxy.ts) — nothing here reads or renders
 * asset-type-specific fields (CLAUDE.md: Mission/Task are asset-agnostic).
 */
export function BoardView() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);

  const [missionFilter, setMissionFilter] = useState<string>(MISSION_FILTER_ALL);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | typeof STATUS_FILTER_ALL>(STATUS_FILTER_ALL);

  const loadAll = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const [missionsResult, tasksResult] = await Promise.all([boardApi.listMissions(), boardApi.listTasks()]);
      setMissions(missionsResult);
      setTasks(tasksResult);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board data");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const missionsById = useMemo(() => new Map(missions.map((m) => [m.id, m])), [missions]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter !== STATUS_FILTER_ALL && task.status !== statusFilter) return false;
      if (missionFilter === MISSION_FILTER_UNASSIGNED && task.mission_id !== null) return false;
      if (
        missionFilter !== MISSION_FILTER_ALL &&
        missionFilter !== MISSION_FILTER_UNASSIGNED &&
        task.mission_id !== missionFilter
      ) {
        return false;
      }
      return true;
    });
  }, [tasks, statusFilter, missionFilter]);

  const draftCount = useMemo(() => tasks.filter((t) => t.status === "draft").length, [tasks]);

  async function handleCreateMission(input: { title: string; description: string }) {
    const mission = await boardApi.createMission(input);
    setMissions((prev) => [...prev, mission]);
  }

  async function handleCreateTask(input: {
    title: string;
    description: string;
    mission_id: string | null;
    asset_id: string | null;
  }) {
    const task = await boardApi.createTask(input);
    setTasks((prev) => [...prev, task]);
  }

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    const updated = await boardApi.updateTaskStatus(taskId, status);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
  }

  async function handleAssign(taskId: string, assetId: string | null) {
    const updated = await boardApi.assignTask(taskId, assetId);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
  }

  if (state === "loading") {
    return (
      <Card>
        <Spinner label="Loading board" />
      </Card>
    );
  }

  if (state === "error") {
    return (
      <Card>
        <h2 style={{ marginTop: 0 }}>Board</h2>
        <p style={{ color: "#991b1b" }}>{error}</p>
        <button onClick={() => void loadAll()} style={{ cursor: "pointer" }}>
          Retry
        </button>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Board</h1>
        {draftCount > 0 && (
          <Badge tone="warning">
            {draftCount} AI-suggested draft{draftCount === 1 ? "" : "s"} to triage
          </Badge>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <Card>
          <MissionForm onSubmit={handleCreateMission} />
        </Card>
        <Card>
          <TaskForm missions={missions} onSubmit={handleCreateTask} />
        </Card>
      </div>

      <Card>
        <h2 style={{ marginTop: 0 }}>Missions</h2>
        {missions.length === 0 ? (
          <p style={{ color: "#6b7280" }}>No missions yet — create one above.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {missions.map((mission) => (
              <li key={mission.id} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{mission.title}</span>
                <Badge tone={mission.status === "active" ? "success" : "neutral"}>{mission.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>Tasks</h2>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <label style={{ fontSize: "0.875rem", display: "flex", gap: "0.375rem", alignItems: "center" }}>
              Mission
              <select
                aria-label="Filter by mission"
                value={missionFilter}
                onChange={(e) => setMissionFilter(e.target.value)}
                style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
              >
                <option value={MISSION_FILTER_ALL}>All</option>
                <option value={MISSION_FILTER_UNASSIGNED}>Unassigned</option>
                {missions.map((mission) => (
                  <option key={mission.id} value={mission.id}>
                    {mission.title}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: "0.875rem", display: "flex", gap: "0.375rem", alignItems: "center" }}>
              Status
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TaskStatus | typeof STATUS_FILTER_ALL)}
                style={{ padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
              >
                <option value={STATUS_FILTER_ALL}>All</option>
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <p style={{ color: "#6b7280" }}>No tasks match the current filters.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                mission={task.mission_id ? missionsById.get(task.mission_id) : undefined}
                onAdvanceStatus={handleStatusChange}
                onSetStatus={handleStatusChange}
                onAssign={handleAssign}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
