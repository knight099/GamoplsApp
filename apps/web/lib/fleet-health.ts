import type { Asset } from "@/components/fleet/types";

const NEEDS_ATTENTION_THRESHOLD = 50;

export interface FleetHealth {
  avg: number | null;
  needsAttentionCount: number;
}

/**
 * Shared fleet-health aggregate — used by both the Overview KPI row and the
 * sidebar fleet-health meter, factored out once rather than duplicated
 * (suggestions.md C-1 flags this exact class of duplication).
 */
export function computeFleetHealth(vehicles: Asset[]): FleetHealth {
  if (vehicles.length === 0) {
    return { avg: null, needsAttentionCount: 0 };
  }
  const total = vehicles.reduce((sum, v) => sum + v.health_score, 0);
  const needsAttentionCount = vehicles.filter((v) => v.health_score < NEEDS_ATTENTION_THRESHOLD).length;
  return { avg: Math.round(total / vehicles.length), needsAttentionCount };
}
