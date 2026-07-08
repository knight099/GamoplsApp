import { TASK_SUGGESTED, taskSuggestedSchema, type EventSubscriber } from "@gamopls/event-schemas";
import type { BoardRepository } from "./repository.js";
import type { Task } from "./types.js";

/**
 * Subscribes to `TaskSuggested` (published by services/ai-engine once
 * Phase 5 lands) via the `EventSubscriber` port and creates a draft Task
 * for each valid suggestion received. The draft has no `mission_id` yet —
 * triage into a Mission happens later, via the normal Task update API, not
 * here.
 *
 * Payloads are re-validated against `taskSuggestedSchema` on receipt (the
 * publisher validates before publishing, but a consumer should never trust
 * the wire without checking) — malformed payloads are logged and dropped,
 * never thrown, so one bad event can't take down the subscription.
 */
export async function subscribeTaskSuggested(
  subscriber: EventSubscriber,
  repo: BoardRepository,
  onDraftCreated?: (task: Task) => void,
) {
  return subscriber.subscribe<unknown>(TASK_SUGGESTED, async (raw) => {
    const parsed = taskSuggestedSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("board: dropped malformed TaskSuggested payload:", parsed.error.flatten());
      return;
    }

    const event = parsed.data;
    const task = await repo.createTask({
      org_id: event.org_id,
      fleet_id: event.fleet_id,
      mission_id: null,
      title: event.title,
      description: event.description,
      status: "draft",
      asset_id: event.asset_id,
    });

    onDraftCreated?.(task);
  });
}
