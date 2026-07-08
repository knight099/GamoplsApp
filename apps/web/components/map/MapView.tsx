"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Card, Spinner } from "@gamopls/ui";
import { fetchFleetPositions, listGeofences, MapApiError } from "./api";
import { AssetPositionsTable } from "./AssetPositionsTable";
import { GeofencePanel } from "./GeofencePanel";
import type { AssetMarker, Geofence } from "./types";
import { RefreshCw } from "lucide-react";

export interface MapViewProps {
  fleetId: string;
  /** Poll interval in ms. Defaults to 5s. Exposed for tests. */
  pollIntervalMs?: number;
}

export function MapView({ fleetId, pollIntervalMs = 5000 }: MapViewProps) {
  const [positions, setPositions] = useState<AssetMarker[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [lastPolledAt, setLastPolledAt] = useState<Date | null>(null);

  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [geofencesLoading, setGeofencesLoading] = useState(true);
  const [geofencesError, setGeofencesError] = useState<string | null>(null);

  const isFirstPositionsLoad = useRef(true);

  const loadPositions = useCallback(async () => {
    if (isFirstPositionsLoad.current) setPositionsLoading(true);
    try {
      const data = await fetchFleetPositions(fleetId);
      setPositions(data.positions);
      setPositionsError(null);
      setLastPolledAt(new Date());
    } catch (err) {
      setPositionsError(err instanceof MapApiError ? err.message : "Failed to load asset positions.");
    } finally {
      setPositionsLoading(false);
      isFirstPositionsLoad.current = false;
    }
  }, [fleetId]);

  const loadGeofences = useCallback(async () => {
    setGeofencesLoading(true);
    try {
      const data = await listGeofences(fleetId);
      setGeofences(data);
      setGeofencesError(null);
    } catch (err) {
      setGeofencesError(err instanceof MapApiError ? err.message : "Failed to load geofences.");
    } finally {
      setGeofencesLoading(false);
    }
  }, [fleetId]);

  useEffect(() => {
    void loadPositions();
    const interval = setInterval(() => void loadPositions(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [loadPositions, pollIntervalMs]);

  useEffect(() => {
    void loadGeofences();
  }, [loadGeofences]);

  return (
    <div className="grid gap-6">
      <Card className="border border-border bg-card/40 p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-border/50 pb-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Map
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Asset tracking for your fleet, refreshed every {Math.round(pollIntervalMs / 1000)}s.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {positionsLoading && positions.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner size={14} label="Refreshing" />
                <span>Syncing...</span>
              </div>
            ) : (
              <Badge tone={positionsError ? "danger" : "success"}>
                {positionsError ? "Sync Error" : "Live Streaming"}
              </Badge>
            )}
            {lastPolledAt && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin-slow" />
                {lastPolledAt.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          *Note: This dashboard delivers telemetry summaries, state feeds, and geo boundary breaches. Consult pilot specifications for V1 coverage boundaries.
        </p>
      </Card>

      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-white mb-4 border-b border-border/50 pb-2">Active Asset Feed</h2>
        {positionsLoading && positions.length === 0 ? (
          <div className="flex justify-center py-8">
            <Spinner size={24} label="Loading asset positions" />
          </div>
        ) : positionsError && positions.length === 0 ? (
          <p role="alert" className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-4 rounded-lg">
            ⚠️ {positionsError}
          </p>
        ) : (
          <AssetPositionsTable positions={positions} />
        )}
      </Card>

      <GeofencePanel
        fleetId={fleetId}
        geofences={geofences}
        loading={geofencesLoading}
        error={geofencesError}
        onChanged={() => void loadGeofences()}
      />
    </div>
  );
}
