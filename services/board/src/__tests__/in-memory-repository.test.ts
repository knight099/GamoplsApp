import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryBoardRepository } from "../in-memory-repository.js";

describe("InMemoryBoardRepository — Mission CRUD round trip", () => {
  let repo: InMemoryBoardRepository;

  beforeEach(() => {
    repo = new InMemoryBoardRepository();
  });

  it("creates, reads, lists, updates and deletes a mission", async () => {
    const created = await repo.createMission({
      org_id: "org-1",
      fleet_id: "fleet-1",
      title: "Chennai pilot rollout",
      description: "Initial pilot mission",
      status: "active",
    });

    expect(created.id).toBeTruthy();
    expect(created.title).toBe("Chennai pilot rollout");
    expect(created.status).toBe("active");

    const fetched = await repo.getMission(created.id, "org-1", "fleet-1");
    expect(fetched).toEqual(created);

    const list = await repo.listMissions("org-1", "fleet-1");
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(created.id);

    const updated = await repo.updateMission(created.id, "org-1", "fleet-1", { status: "completed" });
    expect(updated?.status).toBe("completed");
    expect(updated?.updated_at).toBeTruthy();

    const deleted = await repo.deleteMission(created.id, "org-1", "fleet-1");
    expect(deleted).toBe(true);

    const afterDelete = await repo.getMission(created.id, "org-1", "fleet-1");
    expect(afterDelete).toBeNull();
  });

  it("scopes missions by org_id/fleet_id — cross-tenant access returns null", async () => {
    const created = await repo.createMission({
      org_id: "org-1",
      fleet_id: "fleet-1",
      title: "Tenant A mission",
      description: "",
      status: "active",
    });

    const crossTenant = await repo.getMission(created.id, "org-2", "fleet-1");
    expect(crossTenant).toBeNull();

    const crossFleet = await repo.getMission(created.id, "org-1", "fleet-2");
    expect(crossFleet).toBeNull();
  });
});

describe("InMemoryBoardRepository — Task CRUD round trip", () => {
  let repo: InMemoryBoardRepository;

  beforeEach(() => {
    repo = new InMemoryBoardRepository();
  });

  it("creates, reads, lists, updates and deletes a task belonging to a mission", async () => {
    const mission = await repo.createMission({
      org_id: "org-1",
      fleet_id: "fleet-1",
      title: "Mission A",
      description: "",
      status: "active",
    });

    const created = await repo.createTask({
      org_id: "org-1",
      fleet_id: "fleet-1",
      mission_id: mission.id,
      title: "Inspect asset",
      description: "Routine check",
      status: "open",
      asset_id: null,
    });

    expect(created.mission_id).toBe(mission.id);
    expect(created.asset_id).toBeNull();

    const fetched = await repo.getTask(created.id, "org-1", "fleet-1");
    expect(fetched).toEqual(created);

    const listAll = await repo.listTasks("org-1", "fleet-1");
    expect(listAll).toHaveLength(1);

    const listByMission = await repo.listTasks("org-1", "fleet-1", { mission_id: mission.id });
    expect(listByMission).toHaveLength(1);

    const listByOtherMission = await repo.listTasks("org-1", "fleet-1", { mission_id: "nonexistent" });
    expect(listByOtherMission).toHaveLength(0);

    const updated = await repo.updateTask(created.id, "org-1", "fleet-1", { status: "in_progress" });
    expect(updated?.status).toBe("in_progress");

    const deleted = await repo.deleteTask(created.id, "org-1", "fleet-1");
    expect(deleted).toBe(true);

    const afterDelete = await repo.getTask(created.id, "org-1", "fleet-1");
    expect(afterDelete).toBeNull();
  });

  it("assigns and unassigns a task to an opaque asset_id", async () => {
    const created = await repo.createTask({
      org_id: "org-1",
      fleet_id: "fleet-1",
      mission_id: null,
      title: "Assign me",
      description: "",
      status: "open",
      asset_id: null,
    });

    const assigned = await repo.assignTask(created.id, "org-1", "fleet-1", "asset-42");
    expect(assigned?.asset_id).toBe("asset-42");

    const unassigned = await repo.assignTask(created.id, "org-1", "fleet-1", null);
    expect(unassigned?.asset_id).toBeNull();
  });
});
