"use client";

import { useEffect, useState } from "react";
import * as fleetApi from "./api";
import type { Fleet } from "./types";

export interface FleetSwitcherProps {
  currentFleetId: string;
}

export function FleetSwitcher({ currentFleetId }: FleetSwitcherProps) {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    void fleetApi.listFleets().then(setFleets).catch(() => setFleets([]));
  }, []);

  async function handleChange(fleetId: string) {
    if (fleetId === currentFleetId) return;
    setSwitching(true);
    const response = await fetch("/api/switch-fleet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fleet_id: fleetId }),
    });
    if (response.ok) {
      window.location.reload();
      return;
    }
    setSwitching(false);
  }

  if (fleets.length === 0) {
    return <span className="text-xs text-muted-foreground">fleet: {currentFleetId}</span>;
  }

  return (
    <select
      aria-label="Active fleet"
      value={currentFleetId}
      disabled={switching}
      onChange={(e) => void handleChange(e.target.value)}
      className="h-7 px-2 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary"
    >
      {fleets.map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
}
