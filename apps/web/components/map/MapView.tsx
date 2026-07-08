"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Card, Spinner } from "@gamopls/ui";
import { fetchFleetPositions, listGeofences, MapApiError } from "./api";
import { AssetPositionsTable } from "./AssetPositionsTable";
import { GeofencePanel } from "./GeofencePanel";
import type { AssetMarker, Geofence } from "./types";

export interface MapViewProps {
  fleetId: string;
  /** Poll interval in ms. Defaults to 5s. Exposed for tests. */
  pollIntervalMs?: number;
}

/**
 * MAP view client shell. Polls `GET /api/map/fleets/:fleetId/positions`
 * on an interval rather than opening a WebSocket.
 *
 * Tradeoff note: `services/map` does expose a WS endpoint
 * (`/ws/fleets/:fleetId/positions`), but proxying a WebSocket through a
 * Next.js Route Handler (the BFF gateway pattern this app uses for every
 * other request, see apps/web/lib/gateway-proxy.ts) isn't a fit for the
 * serverless-style request/response handler model — the route handler
 * doesn't hold a long-lived connection or a place to enforce the same
 * JWT-cookie auth check on an upgraded socket. Polling REST on an
 * interval reuses the exact same authenticated fetch path as everything
 * else in the app, at the cost of up-to-`pollIntervalMs` staleness
 * instead of push updates.
 */
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
    <div style={{ display: "grid", gap: "1rem" }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
          <h1 style={{ margin: 0 }}>Map</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {positionsLoading && positions.length === 0 ? (
              <Spinner size={14} label="Refreshing" />
            ) : (
              <Badge tone={positionsError ? "danger" : "success"}>
                {positionsError ? "Update failed" : "Live (polling)"}
              </Badge>
            )}
            {lastPolledAt && (
              <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                Updated {lastPolledAt.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <p style={{ color: "#6b7280", marginBottom: 0 }}>
          Asset positions for your fleet, refreshed every {Math.round(pollIntervalMs / 1000)}s. This is a
          list view of live positions, not an interactive map — see project notes for the V1 scope.
        </p>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Asset positions</h2>
        {positionsLoading && positions.length === 0 ? (
          <Spinner label="Loading asset positions" />
        ) : positionsError && positions.length === 0 ? (
          <p role="alert" style={{ color: "#991b1b" }}>
            {positionsError}
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
