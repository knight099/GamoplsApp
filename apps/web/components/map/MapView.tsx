"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Badge, Card, Spinner } from "@gamopls/ui";
import { fetchFleetPositions, listGeofences, MapApiError } from "./api";
import { AssetPositionsTable } from "./AssetPositionsTable";
import { GeofencePanel } from "./GeofencePanel";
import type { AssetMarker, Geofence } from "./types";
import { listVehicles } from "@/components/fleet/api";
import type { Asset } from "@/components/fleet/types";
import type { MapMarkerData } from "./MapCanvas";
import { RefreshCw } from "lucide-react";

const MapCanvas = dynamic(() => import("./MapCanvas").then((m) => m.MapCanvas), { ssr: false });

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

  const [vehicleAssets, setVehicleAssets] = useState<Asset[]>([]);

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
      const data = await listGeofences();
      setGeofences(data);
      setGeofencesError(null);
    } catch (err) {
      setGeofencesError(err instanceof MapApiError ? err.message : "Failed to load geofences.");
    } finally {
      setGeofencesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPositions();
    const interval = setInterval(() => void loadPositions(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [loadPositions, pollIntervalMs]);

  useEffect(() => {
    void loadGeofences();
  }, [loadGeofences]);

  const loadVehicleAssets = useCallback(async () => {
    try {
      const data = await listVehicles();
      setVehicleAssets(data);
    } catch {
      // Non-fatal: markers just render without health/fuel/odometer if this fails.
      setVehicleAssets([]);
    }
  }, []);

  useEffect(() => {
    void loadVehicleAssets();
  }, [loadVehicleAssets]);

  const assetsById = new Map(vehicleAssets.map((a) => [a.id, a]));
  const markers: MapMarkerData[] = positions.map((p) => {
    const asset = assetsById.get(p.id);
    return {
      id: p.id,
      icon: p.icon,
      label: p.label,
      lat: p.lat,
      lng: p.lng,
      heading: p.heading,
      speed: p.speed,
      positionUpdatedAt: p.positionUpdatedAt,
      healthScore: asset?.health_score,
      fuelPct: typeof asset?.telemetry.fuel_pct === "number" ? asset.telemetry.fuel_pct : null,
      odometerKm: asset?.vehicleDetails?.odometerKm ?? null,
    };
  });

  return (
    <div className="grid gap-6">
      <Card className="border border-border bg-card/40 p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-border/50 pb-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
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

      <Card className="border border-border bg-card p-4">
        <MapCanvas markers={markers} geofences={geofences} />
      </Card>

      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-foreground mb-4 border-b border-border/50 pb-2">Active Asset Feed</h2>
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
        geofences={geofences}
        loading={geofencesLoading}
        error={geofencesError}
        onChanged={() => void loadGeofences()}
      />
    </div>
  );
}
