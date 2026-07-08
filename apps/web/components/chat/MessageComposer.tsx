"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@gamopls/ui";
import { Input } from "../ui/input";
import { Send, ShieldAlert } from "lucide-react";

export interface MessageComposerProps {
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
}

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
    <form onSubmit={handleSubmit} className="space-y-2 mt-auto">
      <div className="flex gap-2">
        <Input
          aria-label="Message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={disabled || submitting}
          placeholder="Type dispatcher instructions..."
          className="flex-1 bg-background/50 border-border"
        />
        <Button 
          type="submit" 
          disabled={disabled || submitting || !body.trim()}
          style={{ padding: "0.5rem 1rem", minWidth: "4.5rem" }}
        >
          <Send className="h-4 w-4 mr-1 shrink-0" />
          {submitting ? "..." : "Send"}
        </Button>
      </div>
      {error && (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </form>
  );
}
