import type { CreateMissionChannelInput, MissionChannel, UpdateMissionChannelInput } from "../types.js";

/**
 * Persistence port for mission channels. Kept swappable/mockable (per the
 * V1 storage note in PLAN.md 4.2): the in-memory implementation is used in
 * tests and can back a real deployment too if Postgres isn't reachable;
 * PostgresChannelRepository is the production-shaped implementation.
 */
export interface ChannelRepository {
  create(input: CreateMissionChannelInput): Promise<MissionChannel>;
  findById(id: string): Promise<MissionChannel | null>;
  /** All channels for a mission (usually zero or one, but not enforced as unique). */
  listByMission(org_id: string, mission_id: string): Promise<MissionChannel[]>;
  /** All channels scoped to a fleet — used by the alert-to-channel mapping. */
  listByFleet(org_id: string, fleet_id: string): Promise<MissionChannel[]>;
  list(org_id: string): Promise<MissionChannel[]>;
  update(id: string, input: UpdateMissionChannelInput): Promise<MissionChannel | null>;
  delete(id: string): Promise<boolean>;
}
