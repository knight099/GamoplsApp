import type { Asset, Taskable } from "@gamopls/asset-contracts";
import type { BoardRepository } from "./repository.js";
import type { Task } from "./types.js";

/**
 * Task assignment must work against ANY asset — vehicle, drone, vessel,
 * whatever plugin exists — without this service knowing or caring which.
 * The only things this function needs from the caller's asset object are
 * its opaque `id` (from the base `Asset` interface) and that it satisfies
 * `Taskable` (from `@gamopls/asset-contracts`); no concrete plugin type is
 * ever imported or referenced here.
 */
export type AssignableAsset = Pick<Asset, "id"> & Taskable;

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task ${taskId} not found`);
    this.name = "TaskNotFoundError";
  }
}

/**
 * Assigns `task` to `asset`. Board owns the Task.asset_id side of this
 * relationship; the returned `assignedTaskId` is what the caller (whoever
 * owns the actual asset object — module service or plugin, not board) is
 * expected to set on their own `Taskable.assignedTaskId` field. Board never
 * mutates the asset object directly — it doesn't hold a reference to one,
 * only to `asset.id`.
 */
export async function assignTaskToAsset(
  repo: BoardRepository,
  taskId: string,
  org_id: string,
  fleet_id: string,
  asset: AssignableAsset,
): Promise<{ task: Task; assignedTaskId: string }> {
  const task = await repo.assignTask(taskId, org_id, fleet_id, asset.id);
  if (!task) throw new TaskNotFoundError(taskId);
  return { task, assignedTaskId: task.id };
}

/** Unassigns whatever asset is currently on `taskId`, if any. */
export async function unassignTask(
  repo: BoardRepository,
  taskId: string,
  org_id: string,
  fleet_id: string,
): Promise<Task> {
  const task = await repo.assignTask(taskId, org_id, fleet_id, null);
  if (!task) throw new TaskNotFoundError(taskId);
  return task;
}
