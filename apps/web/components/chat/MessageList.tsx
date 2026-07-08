import { Badge, Spinner } from "@gamopls/ui";
import type { ChatMessage } from "./types";

export interface MessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Renders a channel's messages. System messages (senderType "system" —
 * auto-posted from AlertRaised events by services/chat's AlertBridge) are
 * visually distinguished with a Badge so operators can tell an automated
 * alert notice apart from a teammate's message at a glance.
 */
export function MessageList({ messages, loading, error }: MessageListProps) {
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "1rem" }}>
        <Spinner size={14} /> <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>Loading messages…</span>
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" style={{ color: "#dc2626", fontSize: "0.875rem", padding: "1rem" }}>
        {error}
      </p>
    );
  }

  if (messages.length === 0) {
    return (
      <p style={{ color: "#6b7280", fontSize: "0.875rem", padding: "1rem" }}>
        No messages yet — say something below.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {messages.map((message) => (
        <li key={message.id} data-testid="chat-message" data-sender-type={message.senderType}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <strong style={{ fontSize: "0.875rem" }}>{message.senderId}</strong>
            {message.senderType === "system" && <Badge tone="info">System alert</Badge>}
            <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{formatTimestamp(message.createdAt)}</span>
          </div>
          <p style={{ margin: "0.125rem 0 0", fontSize: "0.875rem" }}>{message.body}</p>
          {message.media && (
            <a
              href={message.media.url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: "0.8125rem", color: "#2563eb" }}
            >
              📎 {message.media.filename} ({message.media.mimeType}, {message.media.size} bytes)
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
