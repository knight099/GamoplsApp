/**
 * BOARD view types — deliberately mirror services/board/src/types.ts's
 * wire shapes (Mission/Task) rather than importing that package directly:
 * services/board is a standalone deployable Fastify service (per
 * CLAUDE.md's "plugins/services are separate deployable services" rule),
 * not a library apps/web should depend on at build time. This file is the
 * single source of truth on the web side for what those shapes look like;
 * keep it in sync with services/board/src/types.ts if that ever changes.
 *
 * IMPORTANT (CLAUDE.md): a Mission/Task is asset-type-agnostic. Do not add
 * vehicle-specific fields (plate number, fuel type, VIN, ...) here or
 * anywhere in apps/web/components/board — a Task only ever references an
 * asset via the opaque `asset_id` string.
 */

export const MISSION_STATUSES = ["active", "completed", "archived"] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const TASK_STATUSES = ["draft", "open", "in_progress", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * The forward progression a fleet manager can move a task through via the
 * UI's "advance status" control. `cancelled` is reachable separately (it's
 * a terminal/side state, not a step in the happy path), and `draft` is a
 * starting point only (tasks auto-created from a TaskSuggested event) —
 * nothing moves a task back into `draft`.
 */
export const TASK_STATUS_FORWARD_FLOW: TaskStatus[] = ["draft", "open", "in_progress", "done"];

export interface Mission {
  id: string;
  org_id: string;
  fleet_id: string;
  title: string;
  description: string;
  status: MissionStatus;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  org_id: string;
  fleet_id: string;
  mission_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  /** Opaque reference to the assigned asset (any type). Never resolved or
   * enriched here — that's a services/map / asset-lookup concern. */
  asset_id: string | null;
  created_at: string;
  updated_at: string;
}
