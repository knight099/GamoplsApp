"use client";

import { useState } from "react";

export type HotspotTone = "success" | "warning" | "danger" | "neutral";

export interface Hotspot {
  key: "engine" | "battery" | "fuel" | "overall";
  label: string;
  cx: number;
  cy: number;
  value: number | null;
  unit: string;
  tone: HotspotTone;
}

const TONE_COLORS: Record<HotspotTone, string> = {
  success: "#4ade80",
  warning: "#fbbf24",
  danger: "#f87171",
  neutral: "#6b7280",
};

function toneFor(value: number | null, thresholds: { good: number; ok: number; higherIsBetter: boolean }): HotspotTone {
  if (value === null) return "neutral";
  const { good, ok, higherIsBetter } = thresholds;
  if (higherIsBetter) {
    if (value >= good) return "success";
    if (value >= ok) return "warning";
    return "danger";
  }
  if (value <= good) return "success";
  if (value <= ok) return "warning";
  return "danger";
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function computeHotspots(telemetry: Record<string, unknown>, healthScore: number): Hotspot[] {
  const engineTemp = numberOrNull(telemetry.engine_temp_c);
  const batteryPct = numberOrNull(telemetry.battery_pct);
  const fuelPct = numberOrNull(telemetry.fuel_pct);

  return [
    {
      key: "engine",
      label: "Engine",
      cx: 90,
      cy: 55,
      value: engineTemp,
      unit: "°C",
      tone: toneFor(engineTemp, { good: 95, ok: 110, higherIsBetter: false }),
    },
    {
      key: "battery",
      label: "Battery",
      cx: 60,
      cy: 45,
      value: batteryPct,
      unit: "%",
      tone: toneFor(batteryPct, { good: 50, ok: 25, higherIsBetter: true }),
    },
    {
      key: "fuel",
      label: "Fuel",
      cx: 180,
      cy: 55,
      value: fuelPct,
      unit: "%",
      tone: toneFor(fuelPct, { good: 30, ok: 10, higherIsBetter: true }),
    },
    {
      key: "overall",
      label: "Overall",
      cx: 150,
      cy: 25,
      value: healthScore,
      unit: "",
      tone: toneFor(healthScore, { good: 80, ok: 50, higherIsBetter: true }),
    },
  ];
}

export interface VehicleDigitalTwinProps {
  telemetry: Record<string, unknown>;
  healthScore: number;
}

export function VehicleDigitalTwin({ telemetry, healthScore }: VehicleDigitalTwinProps) {
  const hotspots = computeHotspots(telemetry, healthScore);
  const [selected, setSelected] = useState<Hotspot | null>(null);

  function formatValue(h: Hotspot): string {
    return h.value === null ? "No data" : `${h.value}${h.unit}`;
  }

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 300 120" className="w-full max-w-md" role="img" aria-label="Vehicle digital twin">
        {/* Simple generic vehicle silhouette — same outline regardless of vehicle type */}
        <rect x="20" y="40" width="220" height="35" rx="10" fill="#27272a" stroke="#3f3f46" />
        <path d="M50 40 L80 15 L200 15 L230 40 Z" fill="#27272a" stroke="#3f3f46" />
        <circle cx="70" cy="80" r="14" fill="#18181b" stroke="#3f3f46" />
        <circle cx="210" cy="80" r="14" fill="#18181b" stroke="#3f3f46" />

        {hotspots.map((h) => (
          <circle
            key={h.key}
            data-testid={`hotspot-${h.key}`}
            aria-label={`${h.label}: ${formatValue(h)}`}
            cx={h.cx}
            cy={h.cy}
            r={9}
            fill={TONE_COLORS[h.tone]}
            stroke="white"
            strokeWidth={2}
            style={{ cursor: "pointer" }}
            onClick={() => setSelected(h)}
          />
        ))}
      </svg>

      <div className="flex flex-wrap gap-2">
        {hotspots.map((h) => (
          <button
            key={h.key}
            type="button"
            data-testid={`legend-${h.key}`}
            onClick={() => setSelected(h)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <span
              style={{ width: 8, height: 8, borderRadius: "50%", background: TONE_COLORS[h.tone], display: "inline-block" }}
            />
            {h.label}
          </button>
        ))}
      </div>

      {selected && (
        <p className="text-sm text-foreground font-semibold">
          {selected.label}: {formatValue(selected)}
        </p>
      )}
    </div>
  );
}
