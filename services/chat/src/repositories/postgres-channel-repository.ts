import type { Pool } from "pg";
import type { ChannelRepository } from "./channel-repository.js";
import type { CreateMissionChannelInput, MissionChannel, UpdateMissionChannelInput } from "../types.js";

interface ChannelRow {
  id: string;
  org_id: string;
  fleet_id: string;
  mission_id: string;
  name: string;
  created_at: string;
}

function requireRow<T>(row: T | undefined, context: string): T {
  if (!row) throw new Error(`${context}: expected a row to be returned`);
  return row;
}

function toChannel(row: ChannelRow): MissionChannel {
  return {
    id: row.id,
    org_id: row.org_id,
    fleet_id: row.fleet_id,
    mission_id: row.mission_id,
    name: row.name,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Postgres-backed ChannelRepository, plain SQL via `pg` (no ORM/migration
 * framework — see db/schema.sql). Swappable 1:1 with InMemoryChannelRepository
 * since both implement ChannelRepository.
 */
export class PostgresChannelRepository implements ChannelRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateMissionChannelInput): Promise<MissionChannel> {
    const result = await this.pool.query<ChannelRow>(
      `INSERT INTO mission_channels (org_id, fleet_id, mission_id, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, org_id, fleet_id, mission_id, name, created_at`,
      [input.org_id, input.fleet_id, input.mission_id, input.name],
    );
    return toChannel(requireRow(result.rows[0], "PostgresChannelRepository.create"));
  }

  async findById(id: string): Promise<MissionChannel | null> {
    const result = await this.pool.query<ChannelRow>(
      `SELECT id, org_id, fleet_id, mission_id, name, created_at FROM mission_channels WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? toChannel(result.rows[0]) : null;
  }

  async listByMission(org_id: string, mission_id: string): Promise<MissionChannel[]> {
    const result = await this.pool.query<ChannelRow>(
      `SELECT id, org_id, fleet_id, mission_id, name, created_at FROM mission_channels
       WHERE org_id = $1 AND mission_id = $2`,
      [org_id, mission_id],
    );
    return result.rows.map(toChannel);
  }

  async listByFleet(org_id: string, fleet_id: string): Promise<MissionChannel[]> {
    const result = await this.pool.query<ChannelRow>(
      `SELECT id, org_id, fleet_id, mission_id, name, created_at FROM mission_channels
       WHERE org_id = $1 AND fleet_id = $2
       ORDER BY created_at ASC`,
      [org_id, fleet_id],
    );
    return result.rows.map(toChannel);
  }

  async list(org_id: string): Promise<MissionChannel[]> {
    const result = await this.pool.query<ChannelRow>(
      `SELECT id, org_id, fleet_id, mission_id, name, created_at FROM mission_channels WHERE org_id = $1`,
      [org_id],
    );
    return result.rows.map(toChannel);
  }

  async update(id: string, input: UpdateMissionChannelInput): Promise<MissionChannel | null> {
    if (input.name === undefined) return this.findById(id);
    const result = await this.pool.query<ChannelRow>(
      `UPDATE mission_channels SET name = $2 WHERE id = $1
       RETURNING id, org_id, fleet_id, mission_id, name, created_at`,
      [id, input.name],
    );
    return result.rows[0] ? toChannel(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM mission_channels WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
