"use client";

import Link from "next/link";
import { StatusChip } from "@gamopls/ui";
import type { Asset } from "./types";

export interface VehiclesTableProps {
  vehicles: Asset[];
}

function healthTone(score: number): "success" | "warning" | "danger" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

function odometerLabel(v: Asset): string {
  // Live telemetry odometer wins; the vehicleDetails value is only the
  // reading captured at onboarding (suggestions.md D-1).
  if (typeof v.telemetry.odometer_km === "number") {
    return `${v.telemetry.odometer_km.toLocaleString()} km`;
  }
  if (v.vehicleDetails) return `${v.vehicleDetails.odometerKm.toLocaleString()} km`;
  return "—";
}

export function VehiclesTable({ vehicles }: VehiclesTableProps) {
  if (vehicles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg">
        No vehicles yet — add one above.
      </p>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
          <th className="py-2">Vehicle</th>
          <th className="py-2">Health</th>
          <th className="py-2">Fuel</th>
          <th className="py-2">Odometer</th>
        </tr>
      </thead>
      <tbody>
        {vehicles.map((v) => (
          <tr key={v.id} className="border-b border-border/50 hover:bg-accent/40 transition-colors">
            <td className="py-2 font-semibold">
              <Link
                href={`/fleet/vehicles/${encodeURIComponent(v.id)}`}
                className="text-foreground hover:text-primary hover:underline underline-offset-2"
              >
                {v.display_label}
              </Link>
            </td>
            <td className="py-2">
              <StatusChip tone={healthTone(v.health_score)}>{v.health_score}</StatusChip>
            </td>
            <td className="py-2 text-muted-foreground">
              {typeof v.telemetry.fuel_pct === "number" ? `${v.telemetry.fuel_pct}%` : "—"}
            </td>
            <td className="py-2 text-muted-foreground">{odometerLabel(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
