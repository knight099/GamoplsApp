"use client";

import { useState } from "react";
import { VehiclesPanel } from "@/components/fleet/VehiclesPanel";
import { DriversPanel } from "@/components/fleet/DriversPanel";

type Tab = "vehicles" | "drivers";

export default function FleetPage() {
  const [tab, setTab] = useState<Tab>("vehicles");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Fleet</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage vehicles, drivers, and assignments.</p>
      </div>
      <div className="flex gap-2 border-b border-border">
        {(["vehicles", "drivers"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 transition-colors ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "vehicles" ? <VehiclesPanel /> : <DriversPanel />}
    </div>
  );
}
