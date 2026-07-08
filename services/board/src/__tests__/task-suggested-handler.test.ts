import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventSubscriber, Subscription } from "@gamopls/event-schemas";
import { TASK_SUGGESTED } from "@gamopls/event-schemas";
import { InMemoryBoardRepository } from "../in-memory-repository.js";
import { subscribeTaskSuggested } from "../task-suggested-handler.js";

/** Minimal mock EventSubscriber: captures the handler so tests can deliver events directly, no real transport. */
class MockEventSubscriber implements EventSubscriber {
  private handlers = new Map<string, (payload: unknown) => Promise<void> | void>();

  async subscribe<T>(subject: string, handler: (payload: T) => Promise<void> | void): Promise<Subscription> {
    this.handlers.set(subject, handler as (payload: unknown) => Promise<void> | void);
    return { unsubscribe: async () => {} };
  }

  async deliver(subject: string, payload: unknown): Promise<void> {
    const handler = this.handlers.get(subject);
    if (!handler) throw new Error(`no handler registered for ${subject}`);
    await handler(payload);
  }
}

describe("subscribeTaskSuggested", () => {
  let repo: InMemoryBoardRepository;
  let subscriber: MockEventSubscriber;

  beforeEach(() => {
    repo = new InMemoryBoardRepository();
    subscriber = new MockEventSubscriber();
  });

  it("creates a draft task from a valid TaskSuggested payload", async () => {
    const onDraftCreated = vi.fn();
    await subscribeTaskSuggested(subscriber, repo, onDraftCreated);

    await subscriber.deliver(TASK_SUGGESTED, {
      type: TASK_SUGGESTED,
      org_id: "org-1",
      fleet_id: "fleet-1",
      timestamp: new Date().toISOString(),
      asset_id: "asset-1",
      title: "Schedule maintenance",
      description: "Health score dropped below 40",
      source: "ai-engine.health-score",
    });

    const tasks = await repo.listTasks("org-1", "fleet-1");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: "Schedule maintenance",
      description: "Health score dropped below 40",
      status: "draft",
      asset_id: "asset-1",
      mission_id: null,
    });
    expect(onDraftCreated).toHaveBeenCalledTimes(1);
  });

  it("drops a malformed payload without throwing and without creating a task", async () => {
    const onDraftCreated = vi.fn();
    await subscribeTaskSuggested(subscriber, repo, onDraftCreated);

    await expect(
      subscriber.deliver(TASK_SUGGESTED, {
        type: TASK_SUGGESTED,
        org_id: "org-1",
        fleet_id: "fleet-1",
        timestamp: new Date().toISOString(),
        asset_id: "asset-1",
        title: "", // invalid: empty title
        description: "desc",
        source: "ai-engine.health-score",
      }),
    ).resolves.toBeUndefined();

    const tasks = await repo.listTasks("org-1", "fleet-1");
    expect(tasks).toHaveLength(0);
    expect(onDraftCreated).not.toHaveBeenCalled();
  });
});
