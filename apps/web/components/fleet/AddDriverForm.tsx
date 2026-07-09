"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@gamopls/ui";
import { Input } from "../ui/input";
import { Plus, ShieldAlert } from "lucide-react";
import type { CreateDriverInput } from "./types";

export interface AddDriverFormProps {
  onSubmit: (input: CreateDriverInput) => Promise<void>;
}

export function AddDriverForm({ onSubmit }: AddDriverFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [license, setLicense] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        phone: phone.trim() || null,
        license_number: license.trim() || null,
      });
      setName("");
      setPhone("");
      setLicense("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add driver");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
        <Plus className="h-4 w-4 text-cyan-400" />
        Add driver
      </h3>
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Name</label>
        <Input aria-label="Driver name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kumar S" className="h-8 text-xs bg-background/50 border-border" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input aria-label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" className="h-8 text-xs bg-background/50 border-border" />
        <Input aria-label="License number" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="License (optional)" className="h-8 text-xs bg-background/50 border-border" />
      </div>
      {error && (
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button type="submit" disabled={submitting || !name.trim()} style={{ width: "100%", padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}>
        {submitting ? "Adding…" : "Add driver"}
      </Button>
    </form>
  );
}
