"use client";

import { useState, type FormEvent } from "react";
import { Button, Card } from "@gamopls/ui";
import { Input } from "../ui/input";
import { Plus, ShieldAlert } from "lucide-react";

export interface NewChannelFormProps {
  onCreate: (input: { mission_id: string; name: string }) => Promise<void>;
}

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
    <Card className="border border-border bg-card p-4">
      <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-primary" />
        New Mission Channel
      </h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block space-y-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Mission ID
          <Input
            value={missionId}
            onChange={(e) => setMissionId(e.target.value)}
            disabled={submitting}
            placeholder="e.g. mission-101"
            className="h-8 text-xs bg-background/50 border-border font-medium normal-case"
          />
        </label>
        
        <label className="block space-y-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Channel name
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            placeholder="e.g. squad-bravo-chat"
            className="h-8 text-xs bg-background/50 border-border font-medium normal-case"
          />
        </label>

        {error && (
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button 
          type="submit" 
          variant="secondary" 
          disabled={submitting || !missionId.trim() || !name.trim()}
          style={{ width: "100%", padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}
        >
          {submitting ? "Creating…" : "Create channel"}
        </Button>
      </form>
    </Card>
  );
}
