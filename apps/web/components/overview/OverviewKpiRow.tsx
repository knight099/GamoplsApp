"use client";

import { KpiTile } from "@gamopls/ui";
import { Car, HeartPulse, TriangleAlert, Fuel } from "lucide-react";

export interface OverviewKpiRowProps {
  vehiclesOnline: number;
  vehiclesTotal: number;
  avgHealth: number | null;
  activeAlerts24h: number;
  avgMileageKmpl: number | null;
}

export function OverviewKpiRow({
  vehiclesOnline,
  vehiclesTotal,
  avgHealth,
  activeAlerts24h,
  avgMileageKmpl,
}: OverviewKpiRowProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiTile icon={<Car className="h-4 w-4" />} label="Vehicles online" value={String(vehiclesOnline)} unit={`/ ${vehiclesTotal}`} />
      <KpiTile
        icon={<HeartPulse className="h-4 w-4" />}
        label="Avg fleet health"
        value={avgHealth === null ? "—" : String(avgHealth)}
        unit={avgHealth === null ? undefined : "%"}
      />
      <KpiTile icon={<TriangleAlert className="h-4 w-4" />} label="Active alerts (24h)" value={String(activeAlerts24h)} />
      <KpiTile
        icon={<Fuel className="h-4 w-4" />}
        label="Avg mileage"
        value={avgMileageKmpl === null ? "—" : avgMileageKmpl.toFixed(1)}
        unit={avgMileageKmpl === null ? undefined : "km/L"}
      />
    </div>
  );
}
