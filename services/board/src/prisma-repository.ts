import type { PrismaClient } from "@gamopls/db";
import type { BoardRepository } from "./repository.js";
import type {
  CreateMissionInput,
  CreateTaskInput,
  Mission,
  Task,
  UpdateMissionInput,
  UpdateTaskInput,
} from "./types.js";

export class PrismaBoardRepository implements BoardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapMission(dbMission: any): Mission {
    return {
      id: dbMission.id,
      org_id: dbMission.org_id,
      fleet_id: dbMission.fleet_id,
      title: dbMission.title,
      description: dbMission.description,
      status: dbMission.status as Mission["status"],
      created_at: dbMission.created_at.toISOString(),
      updated_at: dbMission.updated_at.toISOString(),
    };
  }

  private mapTask(dbTask: any): Task {
    return {
      id: dbTask.id,
      org_id: dbTask.org_id,
      fleet_id: dbTask.fleet_id,
      mission_id: dbTask.mission_id,
      title: dbTask.title,
      description: dbTask.description,
      status: dbTask.status as Task["status"],
      asset_id: dbTask.asset_id,
      created_at: dbTask.created_at.toISOString(),
      updated_at: dbTask.updated_at.toISOString(),
    };
  }

  async createMission(input: CreateMissionInput): Promise<Mission> {
    const dbMission = await this.prisma.mission.create({
      data: {
        org_id: input.org_id,
        fleet_id: input.fleet_id,
        title: input.title,
        description: input.description ?? "",
        status: input.status,
      },
    });
    return this.mapMission(dbMission);
  }

  async getMission(id: string, org_id: string, fleet_id: string): Promise<Mission | null> {
    const dbMission = await this.prisma.mission.findFirst({
      where: { id, org_id, fleet_id },
    });
    return dbMission ? this.mapMission(dbMission) : null;
  }

  async listMissions(org_id: string, fleet_id: string): Promise<Mission[]> {
    const dbMissions = await this.prisma.mission.findMany({
      where: { org_id, fleet_id },
      orderBy: { created_at: "desc" },
    });
    return dbMissions.map((m) => this.mapMission(m));
  }

  async updateMission(
    id: string,
    org_id: string,
    fleet_id: string,
    patch: UpdateMissionInput,
  ): Promise<Mission | null> {
    try {
      const dbMission = await this.prisma.mission.update({
        where: { id, org_id, fleet_id },
        data: {
          title: patch.title !== undefined ? patch.title : undefined,
          description: patch.description !== undefined ? patch.description : undefined,
          status: patch.status !== undefined ? patch.status : undefined,
        },
      });
      return this.mapMission(dbMission);
    } catch {
      return null;
    }
  }

  async deleteMission(id: string, org_id: string, fleet_id: string): Promise<boolean> {
    try {
      await this.prisma.mission.delete({
        where: { id, org_id, fleet_id },
      });
      return true;
    } catch {
      return false;
    }
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const dbTask = await this.prisma.task.create({
      data: {
        org_id: input.org_id,
        fleet_id: input.fleet_id,
        mission_id: input.mission_id,
        title: input.title,
        description: input.description ?? "",
        status: input.status,
        asset_id: input.asset_id,
      },
    });
    return this.mapTask(dbTask);
  }

  async getTask(id: string, org_id: string, fleet_id: string): Promise<Task | null> {
    const dbTask = await this.prisma.task.findFirst({
      where: { id, org_id, fleet_id },
    });
    return dbTask ? this.mapTask(dbTask) : null;
  }

  async listTasks(
    org_id: string,
    fleet_id: string,
    filter?: { mission_id?: string | null },
  ): Promise<Task[]> {
    const where: any = { org_id, fleet_id };
    if (filter && filter.mission_id !== undefined) {
      where.mission_id = filter.mission_id;
    }
    const dbTasks = await this.prisma.task.findMany({
      where,
      orderBy: { created_at: "desc" },
    });
    return dbTasks.map((t) => this.mapTask(t));
  }

  async updateTask(
    id: string,
    org_id: string,
    fleet_id: string,
    patch: UpdateTaskInput,
  ): Promise<Task | null> {
    try {
      const dbTask = await this.prisma.task.update({
        where: { id, org_id, fleet_id },
        data: {
          mission_id: patch.mission_id !== undefined ? patch.mission_id : undefined,
          title: patch.title !== undefined ? patch.title : undefined,
          description: patch.description !== undefined ? patch.description : undefined,
          status: patch.status !== undefined ? patch.status : undefined,
        },
      });
      return this.mapTask(dbTask);
    } catch {
      return null;
    }
  }

  async assignTask(
    id: string,
    org_id: string,
    fleet_id: string,
    asset_id: string | null,
  ): Promise<Task | null> {
    try {
      const dbTask = await this.prisma.task.update({
        where: { id, org_id, fleet_id },
        data: { asset_id },
      });
      return this.mapTask(dbTask);
    } catch {
      return null;
    }
  }

  async deleteTask(id: string, org_id: string, fleet_id: string): Promise<boolean> {
    try {
      await this.prisma.task.delete({
        where: { id, org_id, fleet_id },
      });
      return true;
    } catch {
      return false;
    }
  }
}
