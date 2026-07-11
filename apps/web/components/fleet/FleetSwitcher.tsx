"use client";

import { useEffect, useRef, useState } from "react";
import * as fleetApi from "./api";
import type { Fleet } from "./types";

export interface FleetSwitcherProps {
  currentFleetId: string;
}

const NEW_FLEET_SENTINEL = "__new-fleet__";

async function switchToFleet(fleetId: string): Promise<boolean> {
  const response = await fetch("/api/switch-fleet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fleet_id: fleetId }),
  });
  return response.ok;
}

export function FleetSwitcher({ currentFleetId }: FleetSwitcherProps) {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fleetApi.listFleets().then(setFleets).catch(() => setFleets([]));
  }, []);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  async function handleChange(fleetId: string) {
    if (fleetId === NEW_FLEET_SENTINEL) {
      setCreating(true);
      return;
    }
    if (fleetId === currentFleetId) return;
    setBusy(true);
    if (await switchToFleet(fleetId)) {
      window.location.reload();
      return;
    }
    setBusy(false);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setCreateError(null);
    try {
      const fleet = await fleetApi.createFleet(name);
      // Land the user in their new fleet right away; a failed switch still
      // leaves the fleet created and listed.
      if (await switchToFleet(fleet.id)) {
        window.location.reload();
        return;
      }
      setFleets((current) => [...current, fleet]);
      setCreating(false);
      setNewName("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create fleet");
    } finally {
      setBusy(false);
    }
  }

  if (creating) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input
          ref={inputRef}
          aria-label="New fleet name"
          value={newName}
          disabled={busy}
          placeholder="Fleet name"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
            if (e.key === "Escape") {
              setCreating(false);
              setNewName("");
              setCreateError(null);
            }
          }}
          className="h-7 w-32 px-2 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary placeholder:text-primary/50"
        />
        <button
          type="button"
          disabled={busy || !newName.trim()}
          onClick={() => void handleCreate()}
          className="h-7 px-2.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
        >
          Create
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setCreating(false);
            setNewName("");
            setCreateError(null);
          }}
          className="h-7 px-2 rounded-full border border-border text-xs font-medium text-muted-foreground"
        >
          Cancel
        </button>
        {createError && <span className="text-xs text-rose-400">{createError}</span>}
      </span>
    );
  }

  return (
    <select
      aria-label="Active fleet"
      value={currentFleetId}
      disabled={busy}
      onChange={(e) => void handleChange(e.target.value)}
      className="h-7 px-2 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary"
    >
      {fleets.length === 0 && <option value={currentFleetId}>fleet: {currentFleetId}</option>}
      {fleets.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
      <option value={NEW_FLEET_SENTINEL}>＋ New fleet…</option>
    </select>
  );
}
