import { describe, expect, it } from "vitest";
import { filterAlertMessages, mergeEvents, messageToFeedEvent, parseAlertBody, taskToFeedEvent } from "../events-feed";
import type { Task } from "@/components/board/types";
import type { ChatMessage } from "@/components/chat/types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    org_id: "org-1",
    fleet_id: "fleet-1",
    mission_id: null,
    title: "oil_change due for asset asset-1",
    description: "...",
    status: "draft",
    asset_id: "asset-1",
    created_at: "2026-07-12T10:00:00.000Z",
    updated_at: "2026-07-12T10:00:00.000Z",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    channelId: "channel-1",
    org_id: "org-1",
    fleet_id: "fleet-1",
    senderType: "system",
    senderId: "system:alert-bridge",
    body: "[CRITICAL] Battery below 10%",
    createdAt: "2026-07-12T11:00:00.000Z",
    ...overrides,
  };
}

describe("parseAlertBody", () => {
  it("splits a bracketed severity prefix from the message", () => {
    expect(parseAlertBody("[CRITICAL] Battery below 10%")).toEqual({
      severity: "CRITICAL",
      message: "Battery below 10%",
    });
  });

  it("falls back to treating the whole body as the message when there's no bracket", () => {
    expect(parseAlertBody("plain text with no prefix")).toEqual({
      severity: null,
      message: "plain text with no prefix",
    });
  });
});

describe("filterAlertMessages", () => {
  it("keeps only messages from the alert-bridge sender", () => {
    const messages = [makeMessage(), makeMessage({ id: "msg-2", senderId: "user-1", body: "hi" })];
    expect(filterAlertMessages(messages)).toHaveLength(1);
  });
});

describe("taskToFeedEvent / messageToFeedEvent", () => {
  it("maps a draft task to a Suggested/info feed event", () => {
    const event = taskToFeedEvent(makeTask());
    expect(event.chipLabel).toBe("Suggested");
    expect(event.tone).toBe("info");
    expect(event.message).toBe("oil_change due for asset asset-1");
  });

  it("maps a critical alert message to a danger-tone feed event", () => {
    const event = messageToFeedEvent(makeMessage());
    expect(event.tone).toBe("danger");
    expect(event.chipLabel).toBe("Critical");
    expect(event.message).toBe("Battery below 10%");
  });

  it("falls back to neutral tone for an unrecognized severity prefix", () => {
    const event = messageToFeedEvent(makeMessage({ body: "[UNKNOWN] something" }));
    expect(event.tone).toBe("neutral");
  });
});

describe("mergeEvents", () => {
  it("sorts merged tasks and alert messages newest-first", () => {
    const tasks = [makeTask({ id: "t1", created_at: "2026-07-12T09:00:00.000Z" })];
    const messages = [makeMessage({ id: "m1", createdAt: "2026-07-12T12:00:00.000Z" })];
    const result = mergeEvents(tasks, messages);
    expect(result.map((e) => e.id)).toEqual(["message:m1", "task:t1"]);
  });

  it("excludes non-alert-bridge messages", () => {
    const messages = [makeMessage({ senderId: "user-1" })];
    expect(mergeEvents([], messages)).toHaveLength(0);
  });

  it("caps the result to the given limit", () => {
    const tasks = Array.from({ length: 25 }, (_, i) =>
      makeTask({ id: `t${i}`, created_at: `2026-07-12T${String(i).padStart(2, "0")}:00:00.000Z` }),
    );
    expect(mergeEvents(tasks, [])).toHaveLength(20);
  });
});
