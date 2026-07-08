/**
 * Role interface for assets that can be assigned to a Mission/Task
 * (owned by services/board). Only an id reference lives here — the
 * Mission/Task data itself is asset-type-agnostic and lives in board.
 */
export interface Taskable {
  /** id of the Mission/Task (services/board) currently assigned to this asset, if any. */
  assignedTaskId: string | null;
}
