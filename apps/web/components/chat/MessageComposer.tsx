"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@gamopls/ui";

export interface MessageComposerProps {
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
}

/** Simple text-only composer form for posting a new message to the selected channel. */
export function MessageComposer({ onSend, disabled }: MessageComposerProps) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSend(trimmed);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          aria-label="Message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={disabled || submitting}
          placeholder="Write a message…"
          style={{
            flex: 1,
            padding: "0.5rem",
            border: "1px solid #d1d5db",
            borderRadius: "0.375rem",
            fontSize: "0.875rem",
          }}
        />
        <Button type="submit" disabled={disabled || submitting || !body.trim()}>
          {submitting ? "Sending…" : "Send"}
        </Button>
      </div>
      {error && (
        <p role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem", margin: 0 }}>
          {error}
        </p>
      )}
    </form>
  );
}
