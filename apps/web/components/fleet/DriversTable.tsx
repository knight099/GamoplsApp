"use client";

import { Badge } from "@gamopls/ui";
import type { Asset, Driver } from "./types";

export interface DriversTableProps {
  drivers: Driver[];
  vehicles: Asset[];
  onAssign: (driverId: string, assetId: string) => void;
}

export function DriversTable({ drivers, vehicles, onAssign }: DriversTableProps) {
  if (drivers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg">
        No drivers yet — add one above.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
          <th className="py-2">Driver</th>
          <th className="py-2">Status</th>
          <th className="py-2">Assign to vehicle</th>
        </tr>
      </thead>
      <tbody>
        {drivers.map((d) => (
          <tr key={d.id} className="border-b border-border/50">
            <td className="py-2 font-semibold text-foreground">{d.name}</td>
            <td className="py-2">
              <Badge tone={d.status === "active" ? "success" : "neutral"}>{d.status}</Badge>
            </td>
            <td className="py-2">
              <select
                aria-label={`Assign ${d.name} to vehicle`}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) onAssign(d.id, e.target.value);
                }}
                className="h-8 px-2 rounded-md bg-background/50 border border-border text-xs text-foreground"
              >
                <option value="" disabled>
                  Select vehicle…
                </option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.display_label}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
