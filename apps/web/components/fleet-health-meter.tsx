"use client";

import { useEffect, useState } from "react";
import * as fleetApi from "@/components/fleet/api";
import { computeFleetHealth } from "@/lib/fleet-health";

const REFRESH_INTERVAL_MS = 30000;
const BAR_SEGMENTS = 8;

function toneColor(avg: number): string {
  if (avg >= 80) return "#34d399";
  if (avg >= 50) return "#fbbf24";
  return "#fca5a5";
}

/**
 * Sidebar-footer fleet-health summary. Fetches vehicles independently on a
 * slow interval — same "own client-side fetch in the sidebar" pattern
 * FleetSwitcher already uses in the header — since this is footer chrome
 * rendered from the async, session-only root layout, not a page's primary
 * data that would be threaded through props.
 */
export function FleetHealthMeter() {
  const [avg, setAvg] = useState<number | null>(null);
  const [needsAttentionCount, setNeedsAttentionCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const vehicles = await fleetApi.listVehicles();
        if (cancelled) return;
        const health = computeFleetHealth(vehicles);
        setAvg(health.avg);
        setNeedsAttentionCount(health.needsAttentionCount);
      } catch {
        // Footer chrome — a failed fetch just leaves the meter hidden rather than surfacing an error.
      }
    }
    void load();
    const interval = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (avg === null) return null;

  const filledSegments = Math.round((avg / 100) * BAR_SEGMENTS);

  return (
    <div className="space-y-1" data-testid="fleet-health-meter">
      <div style={{ display: "flex", gap: "2px" }} aria-hidden="true">
        {Array.from({ length: BAR_SEGMENTS }, (_, i) => (
          <span
            key={i}
            style={{
              width: "6px",
              height: "10px",
              borderRadius: "1px",
              background: i < filledSegments ? toneColor(avg) : "var(--border)",
            }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Fleet health {avg}%
        {needsAttentionCount > 0 &&
          ` · ${needsAttentionCount} vehicle${needsAttentionCount === 1 ? "" : "s"} need${needsAttentionCount === 1 ? "s" : ""} attention`}
      </p>
    </div>
  );
}
