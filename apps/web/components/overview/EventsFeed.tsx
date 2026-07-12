"use client";

import { StatusChip } from "@gamopls/ui";
import type { FeedEvent } from "@/lib/events-feed";

export interface EventsFeedProps {
  events: FeedEvent[];
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function EventsFeed({ events }: EventsFeedProps) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No recent activity.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {events.map((event) => (
        <li key={event.id} className="py-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="text-[11px] text-muted-foreground"
              style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
            >
              {relativeTime(event.timestamp)}
            </p>
            <p className="text-sm text-foreground truncate">{event.message}</p>
          </div>
          <StatusChip tone={event.tone}>{event.chipLabel}</StatusChip>
        </li>
      ))}
    </ul>
  );
}
