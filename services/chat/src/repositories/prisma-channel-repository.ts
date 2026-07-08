import type { PrismaClient } from "@gamopls/db";
import type { ChannelRepository } from "./channel-repository.js";
import type { CreateMissionChannelInput, MissionChannel, UpdateMissionChannelInput } from "../types.js";

export class PrismaChannelRepository implements ChannelRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapChannel(dbChannel: any): MissionChannel {
    return {
      id: dbChannel.id,
      org_id: dbChannel.org_id,
      fleet_id: dbChannel.fleet_id,
      mission_id: dbChannel.mission_id,
      name: dbChannel.name,
      createdAt: dbChannel.created_at.toISOString(),
    };
  }

  async create(input: CreateMissionChannelInput): Promise<MissionChannel> {
    const dbChannel = await this.prisma.missionChannel.create({
      data: {
        org_id: input.org_id,
        fleet_id: input.fleet_id,
        mission_id: input.mission_id,
        name: input.name,
      },
    });
    return this.mapChannel(dbChannel);
  }

  async findById(id: string): Promise<MissionChannel | null> {
    try {
      const dbChannel = await this.prisma.missionChannel.findUnique({
        where: { id },
      });
      return dbChannel ? this.mapChannel(dbChannel) : null;
    } catch {
      return null;
    }
  }

  async listByMission(org_id: string, mission_id: string): Promise<MissionChannel[]> {
    const dbChannels = await this.prisma.missionChannel.findMany({
      where: { org_id, mission_id },
      orderBy: { created_at: "asc" },
    });
    return dbChannels.map((c) => this.mapChannel(c));
  }

  async listByFleet(org_id: string, fleet_id: string): Promise<MissionChannel[]> {
    const dbChannels = await this.prisma.missionChannel.findMany({
      where: { org_id, fleet_id },
      orderBy: { created_at: "asc" },
    });
    return dbChannels.map((c) => this.mapChannel(c));
  }

  async list(org_id: string): Promise<MissionChannel[]> {
    const dbChannels = await this.prisma.missionChannel.findMany({
      where: { org_id },
      orderBy: { created_at: "asc" },
    });
    return dbChannels.map((c) => this.mapChannel(c));
  }

  async update(id: string, input: UpdateMissionChannelInput): Promise<MissionChannel | null> {
    try {
      const dbChannel = await this.prisma.missionChannel.update({
        where: { id },
        data: {
          name: input.name !== undefined ? input.name : undefined,
        },
      });
      return this.mapChannel(dbChannel);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.missionChannel.delete({
        where: { id },
      });
      return true;
    } catch {
      return false;
    }
  }
}
