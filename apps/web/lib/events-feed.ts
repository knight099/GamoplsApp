import type { StatusTone } from "@gamopls/ui";
import type { Task } from "@/components/board/types";
import type { ChatMessage } from "@/components/chat/types";

export const ALERT_BRIDGE_SENDER_ID = "system:alert-bridge";

export interface FeedEvent {
  id: string;
  timestamp: string;
  message: string;
  chipLabel: string;
  tone: StatusTone;
}

const SEVERITY_TONE: Record<string, StatusTone> = {
  CRITICAL: "danger",
  WARNING: "warning",
  INFO: "info",
};

/**
 * Splits an alert-bridge message body back into its parts for display.
 * `AlertBridge.handleAlert` (services/chat/src/alert-bridge.ts) formats
 * every alert-originated message as `[SEVERITY] message text`, where
 * SEVERITY is one of the three values in `alertSeveritySchema`
 * (packages/event-schemas), uppercased. Falls back to treating the whole
 * body as the message, with no detected severity, if the leading bracket
 * is missing or unrecognized — this feed must degrade gracefully on a
 * message shape it didn't itself produce, not throw.
 */
export function parseAlertBody(body: string): { severity: string | null; message: string } {
  const match = /^\[([A-Z]+)\]\s*(.*)$/.exec(body);
  if (!match) return { severity: null, message: body };
  return { severity: match[1] ?? null, message: match[2] ?? "" };
}

function alertTone(severity: string | null): StatusTone {
  if (!severity) return "neutral";
  return SEVERITY_TONE[severity] ?? "neutral";
}

/** Keeps only messages posted by the alert bridge (services/chat/src/alert-bridge.ts's ALERT_BRIDGE_SENDER_ID) — every other message in a channel is regular chat, not an alert. */
export function filterAlertMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m) => m.senderId === ALERT_BRIDGE_SENDER_ID);
}

export function taskToFeedEvent(task: Task): FeedEvent {
  return {
    id: `task:${task.id}`,
    timestamp: task.created_at,
    message: task.title,
    chipLabel: "Suggested",
    tone: "info",
  };
}

export function messageToFeedEvent(message: ChatMessage): FeedEvent {
  const { severity, message: text } = parseAlertBody(message.body);
  return {
    id: `message:${message.id}`,
    timestamp: message.createdAt,
    message: text,
    chipLabel: severity ? severity.charAt(0) + severity.slice(1).toLowerCase() : "Alert",
    tone: alertTone(severity),
  };
}

/**
 * Merges suggested-task and alert-message events into one feed, newest
 * first, capped for display only. Callers that need a *count* (e.g. the
 * Overview page's "Active alerts (24h)" KPI) must compute it from
 * `filterAlertMessages`'s full output, not from this function's
 * already-capped result — a channel with more than `limit` alerts in the
 * relevant window would otherwise under-count.
 */
export function mergeEvents(tasks: Task[], messages: ChatMessage[], limit = 20): FeedEvent[] {
  const events = [...tasks.map(taskToFeedEvent), ...filterAlertMessages(messages).map(messageToFeedEvent)];
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return events.slice(0, limit);
}
