"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Card, Spinner } from "@gamopls/ui";
import * as boardApi from "./api";
import { MissionForm } from "./MissionForm";
import { TaskForm } from "./TaskForm";
import { TaskCard } from "./TaskCard";
import { TASK_STATUSES } from "./types";
import type { Mission, Task, TaskStatus } from "./types";
import { ListFilter, Sparkles, RefreshCw, AlertCircle } from "lucide-react";

type LoadState = "loading" | "ready" | "error";

const STATUS_FILTER_ALL = "all" as const;
const MISSION_FILTER_ALL = "all" as const;
const MISSION_FILTER_UNASSIGNED = "unassigned" as const;

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
      <div className="flex justify-center items-center py-24">
        <Spinner size={32} label="Loading board" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <Card className="border border-border bg-card p-6 text-center max-w-lg mx-auto mt-12 space-y-4">
        <div className="flex justify-center">
          <AlertCircle className="h-12 w-12 text-rose-400" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Board</h2>
        <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">{error}</p>
        <button 
          onClick={() => void loadAll()} 
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header section */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-border/50 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            Board
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage active dispatcher missions and queue asset automation tasks.
          </p>
        </div>
        {draftCount > 0 && (
          <Badge tone="warning" style={{ fontSize: "11px", padding: "0.25rem 0.75rem" }}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-400 animate-pulse" />
            {draftCount} AI-suggested draft{draftCount === 1 ? "" : "s"} to triage
          </Badge>
        )}
      </div>

      {/* Forms layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-border bg-card/40 p-6 backdrop-blur-sm">
          <MissionForm onSubmit={handleCreateMission} />
        </Card>
        <Card className="border border-border bg-card/40 p-6 backdrop-blur-sm">
          <TaskForm missions={missions} onSubmit={handleCreateTask} />
        </Card>
      </div>

      {/* Missions list */}
      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-foreground mb-4 border-b border-border/50 pb-2">Missions</h2>
        {missions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
            No missions yet — create one above.
          </p>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {missions.map((mission) => (
              <li 
                key={mission.id} 
                className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-background/40 hover:bg-background/80 transition-colors"
              >
                <span className="font-semibold text-sm text-foreground">{mission.title}</span>
                <Badge tone={mission.status === "active" ? "success" : "neutral"} style={{ fontSize: "10px" }}>
                  {mission.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Tasks listing with filters */}
      <Card className="border border-border bg-card p-6">
        <div className="flex justify-between items-center flex-wrap gap-4 mb-6 border-b border-border/50 pb-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            Tasks
          </h2>
          
          <div className="flex gap-4 flex-wrap">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <ListFilter className="h-3.5 w-3.5 text-primary" />
              Mission
              <select
                aria-label="Filter by mission"
                value={missionFilter}
                onChange={(e) => setMissionFilter(e.target.value)}
                className="h-8 px-2.5 rounded-md bg-background/50 border border-border text-xs text-foreground focus-visible:outline-none cursor-pointer"
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
            
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              Status
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TaskStatus | typeof STATUS_FILTER_ALL)}
                className="h-8 px-2.5 rounded-md bg-background/50 border border-border text-xs text-foreground focus-visible:outline-none cursor-pointer"
              >
                <option value={STATUS_FILTER_ALL}>All</option>
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.replace("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg">
            No tasks match the current filters.
          </p>
        ) : (
          <div className="space-y-4">
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
