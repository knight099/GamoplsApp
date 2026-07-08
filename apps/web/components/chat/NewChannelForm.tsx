"use client";

import { useState, type FormEvent } from "react";
import { Button, Card } from "@gamopls/ui";

export interface NewChannelFormProps {
  onCreate: (input: { mission_id: string; name: string }) => Promise<void>;
}

/** Small form for creating a new mission channel. */
export function NewChannelForm({ onCreate }: NewChannelFormProps) {
  const [missionId, setMissionId] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedMissionId = missionId.trim();
    const trimmedName = name.trim();
    if (!trimmedMissionId || !trimmedName) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ mission_id: trimmedMissionId, name: trimmedName });
      setMissionId("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 style={{ fontSize: "0.9375rem", margin: "0 0 0.5rem" }}>New mission channel</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8125rem" }}>
          Mission ID
          <input
            value={missionId}
            onChange={(e) => setMissionId(e.target.value)}
            disabled={submitting}
            style={{ padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8125rem" }}>
          Channel name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            style={{ padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem" }}
          />
        </label>
        {error && (
          <p role="alert" style={{ color: "#dc2626", fontSize: "0.8125rem", margin: 0 }}>
            {error}
          </p>
        )}
        <Button type="submit" variant="secondary" disabled={submitting || !missionId.trim() || !name.trim()}>
          {submitting ? "Creating…" : "Create channel"}
        </Button>
      </form>
    </Card>
  );
}
