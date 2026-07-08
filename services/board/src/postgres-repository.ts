import type { Pool, QueryResultRow } from "pg";
import type { BoardRepository } from "./repository.js";
import type {
  CreateMissionInput,
  CreateTaskInput,
  Mission,
  Task,
  UpdateMissionInput,
  UpdateTaskInput,
} from "./types.js";

/**
 * Postgres-backed `BoardRepository`. Plain `pg` (no ORM), consistent with
 * Phase 4.3's "keep it simple" storage guidance. Callers are responsible
 * for having applied `schema.sql` to the target database — there's no
 * migrations framework in V1.
 *
 * Not exercised against a live database in this repo's test suite (no
 * Postgres reachable in the sandbox this was built in); tests instead run
 * against `InMemoryBoardRepository`, which implements the exact same
 * `BoardRepository` port so business logic and route tests are unaffected
 * by which storage backend is wired in.
 */
export class PostgresBoardRepository implements BoardRepository {
  constructor(private readonly pool: Pool) {}

  private async query<T extends QueryResultRow>(sql: string, params: unknown[]): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  private static toMission(row: MissionRow): Mission {
    return {
      id: row.id,
      org_id: row.org_id,
      fleet_id: row.fleet_id,
      title: row.title,
      description: row.description,
      status: row.status as Mission["status"],
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  private static toTask(row: TaskRow): Task {
    return {
      id: row.id,
      org_id: row.org_id,
      fleet_id: row.fleet_id,
      mission_id: row.mission_id,
      title: row.title,
      description: row.description,
      status: row.status as Task["status"],
      asset_id: row.asset_id,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  async createMission(input: CreateMissionInput): Promise<Mission> {
    const rows = await this.query<MissionRow>(
      `INSERT INTO missions (id, org_id, fleet_id, title, description, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING *`,
      [input.org_id, input.fleet_id, input.title, input.description, input.status],
    );
    return PostgresBoardRepository.toMission(rows[0]!);
  }

  async getMission(id: string, org_id: string, fleet_id: string): Promise<Mission | null> {
    const rows = await this.query<MissionRow>(
      `SELECT * FROM missions WHERE id = $1 AND org_id = $2 AND fleet_id = $3`,
      [id, org_id, fleet_id],
    );
    return rows[0] ? PostgresBoardRepository.toMission(rows[0]) : null;
  }

  async listMissions(org_id: string, fleet_id: string): Promise<Mission[]> {
    const rows = await this.query<MissionRow>(
      `SELECT * FROM missions WHERE org_id = $1 AND fleet_id = $2 ORDER BY created_at DESC`,
      [org_id, fleet_id],
    );
    return rows.map(PostgresBoardRepository.toMission);
  }

  async updateMission(
    id: string,
    org_id: string,
    fleet_id: string,
    patch: UpdateMissionInput,
  ): Promise<Mission | null> {
    const rows = await this.query<MissionRow>(
      `UPDATE missions
       SET title = COALESCE($4, title),
           description = COALESCE($5, description),
           status = COALESCE($6, status),
           updated_at = now()
       WHERE id = $1 AND org_id = $2 AND fleet_id = $3
       RETURNING *`,
      [id, org_id, fleet_id, patch.title ?? null, patch.description ?? null, patch.status ?? null],
    );
    return rows[0] ? PostgresBoardRepository.toMission(rows[0]) : null;
  }

  async deleteMission(id: string, org_id: string, fleet_id: string): Promise<boolean> {
    const rows = await this.query<{ id: string }>(
      `DELETE FROM missions WHERE id = $1 AND org_id = $2 AND fleet_id = $3 RETURNING id`,
      [id, org_id, fleet_id],
    );
    return rows.length > 0;
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const rows = await this.query<TaskRow>(
      `INSERT INTO tasks (id, org_id, fleet_id, mission_id, title, description, status, asset_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.org_id,
        input.fleet_id,
        input.mission_id,
        input.title,
        input.description,
        input.status,
        input.asset_id,
      ],
    );
    return PostgresBoardRepository.toTask(rows[0]!);
  }

  async getTask(id: string, org_id: string, fleet_id: string): Promise<Task | null> {
    const rows = await this.query<TaskRow>(
      `SELECT * FROM tasks WHERE id = $1 AND org_id = $2 AND fleet_id = $3`,
      [id, org_id, fleet_id],
    );
    return rows[0] ? PostgresBoardRepository.toTask(rows[0]) : null;
  }

  async listTasks(
    org_id: string,
    fleet_id: string,
    filter?: { mission_id?: string | null },
  ): Promise<Task[]> {
    if (filter?.mission_id !== undefined) {
      const rows = await this.query<TaskRow>(
        `SELECT * FROM tasks WHERE org_id = $1 AND fleet_id = $2 AND mission_id IS NOT DISTINCT FROM $3
         ORDER BY created_at DESC`,
        [org_id, fleet_id, filter.mission_id],
      );
      return rows.map(PostgresBoardRepository.toTask);
    }
    const rows = await this.query<TaskRow>(
      `SELECT * FROM tasks WHERE org_id = $1 AND fleet_id = $2 ORDER BY created_at DESC`,
      [org_id, fleet_id],
    );
    return rows.map(PostgresBoardRepository.toTask);
  }

  async updateTask(
    id: string,
    org_id: string,
    fleet_id: string,
    patch: UpdateTaskInput,
  ): Promise<Task | null> {
    const rows = await this.query<TaskRow>(
      `UPDATE tasks
       SET mission_id = COALESCE($4, mission_id),
           title = COALESCE($5, title),
           description = COALESCE($6, description),
           status = COALESCE($7, status),
           updated_at = now()
       WHERE id = $1 AND org_id = $2 AND fleet_id = $3
       RETURNING *`,
      [
        id,
        org_id,
        fleet_id,
        patch.mission_id ?? null,
        patch.title ?? null,
        patch.description ?? null,
        patch.status ?? null,
      ],
    );
    return rows[0] ? PostgresBoardRepository.toTask(rows[0]) : null;
  }

  async assignTask(
    id: string,
    org_id: string,
    fleet_id: string,
    asset_id: string | null,
  ): Promise<Task | null> {
    const rows = await this.query<TaskRow>(
      `UPDATE tasks
       SET asset_id = $4, updated_at = now()
       WHERE id = $1 AND org_id = $2 AND fleet_id = $3
       RETURNING *`,
      [id, org_id, fleet_id, asset_id],
    );
    return rows[0] ? PostgresBoardRepository.toTask(rows[0]) : null;
  }

  async deleteTask(id: string, org_id: string, fleet_id: string): Promise<boolean> {
    const rows = await this.query<{ id: string }>(
      `DELETE FROM tasks WHERE id = $1 AND org_id = $2 AND fleet_id = $3 RETURNING id`,
      [id, org_id, fleet_id],
    );
    return rows.length > 0;
  }
}

interface MissionRow extends QueryResultRow {
  id: string;
  org_id: string;
  fleet_id: string;
  title: string;
  description: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface TaskRow extends QueryResultRow {
  id: string;
  org_id: string;
  fleet_id: string;
  mission_id: string | null;
  title: string;
  description: string;
  status: string;
  asset_id: string | null;
  created_at: Date;
  updated_at: Date;
}
