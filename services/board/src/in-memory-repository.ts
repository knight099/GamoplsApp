import { randomUUID } from "node:crypto";
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
 * In-memory `BoardRepository` implementation. Used by default in tests
 * (and usable standalone in dev) so nothing here requires a reachable
 * Postgres instance. See `prisma-repository.ts` for the production
 * adapter — same interface, swappable at the composition root.
 */
export class InMemoryBoardRepository implements BoardRepository {
  private readonly missions = new Map<string, Mission>();
  private readonly tasks = new Map<string, Task>();

  async createMission(input: CreateMissionInput): Promise<Mission> {
    const now = new Date().toISOString();
    const mission: Mission = {
      id: randomUUID(),
      org_id: input.org_id,
      fleet_id: input.fleet_id,
      title: input.title,
      description: input.description,
      status: input.status,
      created_at: now,
      updated_at: now,
    };
    this.missions.set(mission.id, mission);
    return mission;
  }

  async getMission(id: string, org_id: string, fleet_id: string): Promise<Mission | null> {
    const mission = this.missions.get(id);
    if (!mission || mission.org_id !== org_id || mission.fleet_id !== fleet_id) return null;
    return mission;
  }

  async listMissions(org_id: string, fleet_id: string): Promise<Mission[]> {
    return Array.from(this.missions.values()).filter(
      (m) => m.org_id === org_id && m.fleet_id === fleet_id,
    );
  }

  async updateMission(
    id: string,
    org_id: string,
    fleet_id: string,
    patch: UpdateMissionInput,
  ): Promise<Mission | null> {
    const existing = await this.getMission(id, org_id, fleet_id);
    if (!existing) return null;
    const updated: Mission = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    this.missions.set(id, updated);
    return updated;
  }

  async deleteMission(id: string, org_id: string, fleet_id: string): Promise<boolean> {
    const existing = await this.getMission(id, org_id, fleet_id);
    if (!existing) return false;
    return this.missions.delete(id);
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      org_id: input.org_id,
      fleet_id: input.fleet_id,
      mission_id: input.mission_id,
      title: input.title,
      description: input.description,
      status: input.status,
      asset_id: input.asset_id,
      created_at: now,
      updated_at: now,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  async getTask(id: string, org_id: string, fleet_id: string): Promise<Task | null> {
    const task = this.tasks.get(id);
    if (!task || task.org_id !== org_id || task.fleet_id !== fleet_id) return null;
    return task;
  }

  async listTasks(
    org_id: string,
    fleet_id: string,
    filter?: { mission_id?: string | null },
  ): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter((t) => {
      if (t.org_id !== org_id || t.fleet_id !== fleet_id) return false;
      if (filter?.mission_id !== undefined && t.mission_id !== filter.mission_id) return false;
      return true;
    });
  }

  async updateTask(
    id: string,
    org_id: string,
    fleet_id: string,
    patch: UpdateTaskInput,
  ): Promise<Task | null> {
    const existing = await this.getTask(id, org_id, fleet_id);
    if (!existing) return null;
    const updated: Task = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    this.tasks.set(id, updated);
    return updated;
  }

  async assignTask(
    id: string,
    org_id: string,
    fleet_id: string,
    asset_id: string | null,
  ): Promise<Task | null> {
    const existing = await this.getTask(id, org_id, fleet_id);
    if (!existing) return null;
    const updated: Task = {
      ...existing,
      asset_id,
      updated_at: new Date().toISOString(),
    };
    this.tasks.set(id, updated);
    return updated;
  }

  async deleteTask(id: string, org_id: string, fleet_id: string): Promise<boolean> {
    const existing = await this.getTask(id, org_id, fleet_id);
    if (!existing) return false;
    return this.tasks.delete(id);
  }

  /** Test/dev helper — not part of the BoardRepository port. */
  clear(): void {
    this.missions.clear();
    this.tasks.clear();
  }
}
