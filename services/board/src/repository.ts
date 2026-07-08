import type {
  CreateMissionInput,
  CreateTaskInput,
  Mission,
  Task,
  UpdateMissionInput,
  UpdateTaskInput,
} from "./types.js";

/**
 * Persistence port. Storage is isolated behind this interface so tests can
 * use `InMemoryBoardRepository` when a live Postgres isn't reachable, and
 * production wiring can swap in `PostgresBoardRepository` without any
 * business logic (routes, task-assignment, TaskSuggested handling) needing
 * to change.
 *
 * Every method takes `org_id`/`fleet_id` explicitly so tenancy scoping is
 * threaded through the repository layer as defense-in-depth — the primary
 * enforcement point remains the API gateway (CLAUDE.md), not this
 * per-query scoping.
 */
export interface BoardRepository {
  createMission(input: CreateMissionInput): Promise<Mission>;
  getMission(id: string, org_id: string, fleet_id: string): Promise<Mission | null>;
  listMissions(org_id: string, fleet_id: string): Promise<Mission[]>;
  updateMission(
    id: string,
    org_id: string,
    fleet_id: string,
    patch: UpdateMissionInput,
  ): Promise<Mission | null>;
  deleteMission(id: string, org_id: string, fleet_id: string): Promise<boolean>;

  createTask(input: CreateTaskInput): Promise<Task>;
  getTask(id: string, org_id: string, fleet_id: string): Promise<Task | null>;
  listTasks(
    org_id: string,
    fleet_id: string,
    filter?: { mission_id?: string | null },
  ): Promise<Task[]>;
  updateTask(
    id: string,
    org_id: string,
    fleet_id: string,
    patch: UpdateTaskInput,
  ): Promise<Task | null>;
  /** Assign (or unassign, with `asset_id: null`) a Task to an opaque asset id. */
  assignTask(
    id: string,
    org_id: string,
    fleet_id: string,
    asset_id: string | null,
  ): Promise<Task | null>;
  deleteTask(id: string, org_id: string, fleet_id: string): Promise<boolean>;
}
