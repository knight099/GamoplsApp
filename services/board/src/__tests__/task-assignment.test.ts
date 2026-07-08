import { beforeEach, describe, expect, it } from "vitest";
import type { Alertable, AlertThreshold, Asset, Locatable, Monitorable, Taskable } from "@gamopls/asset-contracts";
import { InMemoryBoardRepository } from "../in-memory-repository.js";
import { assignTaskToAsset, TaskNotFoundError, unassignTask, type AssignableAsset } from "../task-assignment.js";

/**
 * A fixture implementing the full Asset + role interface set, exactly like
 * packages/asset-contracts' own TestAsset fixture — proof that task
 * assignment works against ANY Taskable asset without this service
 * knowing/caring about its concrete type (vehicle, drone, whatever).
 */
class GenericTestAsset implements Asset, Locatable, Monitorable, Alertable, Taskable {
  readonly id: string;
  readonly org_id: string;
  readonly fleet_id: string;
  readonly type = "generic-test-asset";
  readonly pluginMetadata: Record<string, unknown> = {};

  lat = 0;
  lng = 0;
  positionUpdatedAt = new Date(0).toISOString();

  healthScore = 100;
  telemetry: Record<string, unknown> = {};
  telemetryUpdatedAt = new Date(0).toISOString();

  alertThresholds: AlertThreshold[] = [];
  hasActiveAlert = false;

  assignedTaskId: string | null = null;

  constructor(id: string, org_id: string, fleet_id: string) {
    this.id = id;
    this.org_id = org_id;
    this.fleet_id = fleet_id;
  }

  getMapIcon(): string {
    return "generic-icon";
  }

  getDisplayLabel(): string {
    return `GenericTestAsset ${this.id}`;
  }
}

describe("assignTaskToAsset", () => {
  let repo: InMemoryBoardRepository;

  beforeEach(() => {
    repo = new InMemoryBoardRepository();
  });

  it("assigns a task to any Taskable asset without branching on asset type", async () => {
    const task = await repo.createTask({
      org_id: "org-1",
      fleet_id: "fleet-1",
      mission_id: null,
      title: "Inspect",
      description: "",
      status: "open",
      asset_id: null,
    });

    const asset = new GenericTestAsset("asset-99", "org-1", "fleet-1");
    // Type-level proof: this is exactly the AssignableAsset shape — only
    // `id` (Asset) + `assignedTaskId` (Taskable), nothing type-specific.
    const assignable: AssignableAsset = asset;

    const { task: updated, assignedTaskId } = await assignTaskToAsset(
      repo,
      task.id,
      "org-1",
      "fleet-1",
      assignable,
    );

    expect(updated.asset_id).toBe("asset-99");
    expect(assignedTaskId).toBe(task.id);

    // Caller (owner of the asset object) would apply this back:
    asset.assignedTaskId = assignedTaskId;
    expect(asset.assignedTaskId).toBe(task.id);
  });

  it("throws TaskNotFoundError when assigning a nonexistent task", async () => {
    const asset = new GenericTestAsset("asset-1", "org-1", "fleet-1");
    await expect(
      assignTaskToAsset(repo, "nonexistent-task", "org-1", "fleet-1", asset),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it("unassigns a task", async () => {
    const task = await repo.createTask({
      org_id: "org-1",
      fleet_id: "fleet-1",
      mission_id: null,
      title: "Inspect",
      description: "",
      status: "open",
      asset_id: "asset-1",
    });

    const updated = await unassignTask(repo, task.id, "org-1", "fleet-1");
    expect(updated.asset_id).toBeNull();
  });
});
