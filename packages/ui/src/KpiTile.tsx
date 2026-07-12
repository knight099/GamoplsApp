import type { ReactNode } from "react";
import { Card } from "./Card.js";

export interface KpiTileDelta {
  label: string;
  tone: "positive" | "negative";
}

export interface KpiTileProps {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  delta?: KpiTileDelta;
}

const DELTA_COLOR: Record<KpiTileDelta["tone"], string> = {
  positive: "#34d399",
  negative: "#fca5a5",
};

const DELTA_ARROW: Record<KpiTileDelta["tone"], string> = {
  positive: "▲",
  negative: "▼",
};

const DATA_FONT = "var(--font-mono, ui-monospace, monospace)";

/**
 * KPI stat tile matching the reference design: icon + label header, large
 * mono value with an optional unit suffix, optional delta row. `delta` is
 * unused by every call site as of this component landing — populating it
 * needs telemetry history (suggestions.md D-2) that doesn't exist yet.
 */
export function KpiTile({ icon, label, value, unit, delta }: KpiTileProps) {
  return (
    <Card style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--muted-foreground)" }}>
        {icon}
        <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
        <span
          style={{
            fontSize: "1.75rem",
            fontWeight: 600,
            color: "var(--foreground)",
            fontFamily: DATA_FONT,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: "0.9375rem", color: "var(--muted-foreground)", fontFamily: DATA_FONT }}>
            {unit}
          </span>
        )}
      </div>
      {delta && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
          <span style={{ color: DELTA_COLOR[delta.tone], fontWeight: 600 }}>
            {DELTA_ARROW[delta.tone]} {delta.label}
          </span>
        </div>
      )}
    </Card>
  );
}
