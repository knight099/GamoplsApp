"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Breadcrumb, Card, Spinner, Button } from "@gamopls/ui";
import { Radio, Sparkles } from "lucide-react";
import * as fleetApi from "@/components/fleet/api";
import type { Asset, DriverAssignment } from "@/components/fleet/types";
import { VehicleDigitalTwin } from "@/components/fleet/VehicleDigitalTwin";
import { MaintenanceCard } from "@/components/fleet/MaintenanceCard";

const POLL_INTERVAL_MS = 5000;

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [history, setHistory] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const isFirstLoad = useRef(true);

  const load = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    try {
      const [assetData, historyData] = await Promise.all([
        fleetApi.getVehicle(params.id),
        fleetApi.listAssignmentHistory(params.id),
      ]);
      setAsset(assetData);
      setHistory(historyData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vehicle");
    } finally {
      setLoading(false);
      isFirstLoad.current = false;
    }
  }, [params.id]);

  useEffect(() => {
    void load();
    // Polls so the "connect this vehicle" card disappears and the digital
    // twin updates once a reading (real or previewed) arrives, without
    // requiring a manual refresh — same pattern as MapView's position poll.
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  async function handlePreview() {
    if (!asset) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      await fleetApi.previewTelemetry(asset.id);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to send preview data");
    } finally {
      setPreviewing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={32} label="Loading vehicle" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <Card className="border border-border bg-card p-6 text-center max-w-lg mx-auto mt-12">
        <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
          {error ?? "Vehicle not found"}
        </p>
      </Card>
    );
  }

  const current = history.find((a) => a.unassigned_at === null);
  // Live odometer from telemetry is the single source of truth
  // (suggestions.md D-1); the vehicleDetails column only records the
  // reading at onboarding and is never updated afterwards.
  const liveOdometerKm =
    typeof asset.telemetry?.odometer_km === "number" ? asset.telemetry.odometer_km : null;

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb segments={[{ label: "Fleet", href: "/fleet" }, { label: asset.display_label }]} />
        <h1 className="text-2xl font-bold text-foreground tracking-tight mt-2">{asset.display_label}</h1>
        <p className="text-sm text-muted-foreground mt-1">Vehicle detail</p>
      </div>

      {asset.telemetry_updated_at === null && (
        <Card className="border border-primary/20 bg-primary/5 p-6 space-y-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Radio className="h-4 w-4 text-primary" />
            Connect this vehicle
          </h2>
          <p className="text-sm text-muted-foreground">
            Pairing ID: <code className="bg-background/50 px-1.5 py-0.5 rounded">{asset.id}</code> — use this to
            connect your Edge Box device.
          </p>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => void handlePreview()}
              disabled={previewing}
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}
            >
              <Sparkles className="h-3.5 w-3.5" style={{ marginRight: "0.35rem" }} />
              {previewing ? "Sending…" : "Preview with live data"}
            </Button>
            <span className="text-xs text-muted-foreground">Don&apos;t have hardware yet? See it on the map now.</span>
          </div>
          {previewError && <p className="text-xs text-rose-400">{previewError}</p>}
        </Card>
      )}

      <Card className="border border-border bg-card p-6 space-y-4">
        <h2 className="text-lg font-bold text-foreground">Digital twin</h2>
        <VehicleDigitalTwin telemetry={asset.telemetry} healthScore={asset.health_score} />
        {asset.vehicleDetails && (
          <div className="text-sm text-muted-foreground space-y-1">
            <div>Plate: {asset.vehicleDetails.plateNumber}</div>
            <div>Type: {asset.vehicleDetails.vehicleType}</div>
            <div>
              Odometer:{" "}
              {liveOdometerKm !== null
                ? `${liveOdometerKm.toLocaleString()} km`
                : `${asset.vehicleDetails.odometerKm.toLocaleString()} km (at onboarding — no live reading yet)`}
            </div>
            {asset.vehicleDetails.make && <div>Make/Model: {asset.vehicleDetails.make} {asset.vehicleDetails.model}</div>}
          </div>
        )}
        <span className="text-sm text-muted-foreground">
          Mileage: {typeof asset.last_mileage_kmpl === "number" ? `${asset.last_mileage_kmpl.toFixed(1)} km/L` : "—"}
        </span>
      </Card>

      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-foreground mb-3">Driver assignment</h2>
        {current ? (
          <p className="text-sm text-foreground">Currently assigned to driver {current.driver_id}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No driver currently assigned.</p>
        )}
      </Card>

      <MaintenanceCard
        assetId={asset.id}
        currentOdometerKm={liveOdometerKm ?? asset.vehicleDetails?.odometerKm ?? 0}
      />
    </div>
  );
}
