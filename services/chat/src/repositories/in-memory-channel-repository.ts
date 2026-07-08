import { randomUUID } from "node:crypto";
import type { ChannelRepository } from "./channel-repository.js";
import type { CreateMissionChannelInput, MissionChannel, UpdateMissionChannelInput } from "../types.js";

/** In-memory ChannelRepository — default for tests and for a Postgres-less dev/demo run. */
export class InMemoryChannelRepository implements ChannelRepository {
  private readonly channels = new Map<string, MissionChannel>();

  async create(input: CreateMissionChannelInput): Promise<MissionChannel> {
    const channel: MissionChannel = {
      id: randomUUID(),
      org_id: input.org_id,
      fleet_id: input.fleet_id,
      mission_id: input.mission_id,
      name: input.name,
      createdAt: new Date().toISOString(),
    };
    this.channels.set(channel.id, channel);
    return channel;
  }

  async findById(id: string): Promise<MissionChannel | null> {
    return this.channels.get(id) ?? null;
  }

  async listByMission(org_id: string, mission_id: string): Promise<MissionChannel[]> {
    return Array.from(this.channels.values()).filter(
      (c) => c.org_id === org_id && c.mission_id === mission_id,
    );
  }

  async listByFleet(org_id: string, fleet_id: string): Promise<MissionChannel[]> {
    return Array.from(this.channels.values())
      .filter((c) => c.org_id === org_id && c.fleet_id === fleet_id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async list(org_id: string): Promise<MissionChannel[]> {
    return Array.from(this.channels.values()).filter((c) => c.org_id === org_id);
  }

  async update(id: string, input: UpdateMissionChannelInput): Promise<MissionChannel | null> {
    const existing = this.channels.get(id);
    if (!existing) return null;
    const updated: MissionChannel = { ...existing, ...input };
    this.channels.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.channels.delete(id);
  }

  clear(): void {
    this.channels.clear();
  }
}
