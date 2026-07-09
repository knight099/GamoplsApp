"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Card, Spinner } from "@gamopls/ui";
import * as fleetApi from "@/components/fleet/api";
import type { Asset, DriverAssignment } from "@/components/fleet/types";

function healthTone(score: number): "success" | "warning" | "danger" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [history, setHistory] = useState<DriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
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
      }
    }
    void load();
  }, [params.id]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">{asset.display_label}</h1>
        <p className="text-sm text-muted-foreground mt-1">Vehicle detail</p>
      </div>

      <Card className="border border-border bg-card p-6 space-y-3">
        <div className="flex items-center gap-3">
          <Badge tone={healthTone(asset.health_score)}>Health {asset.health_score}</Badge>
          {typeof asset.telemetry.fuel_pct === "number" && (
            <span className="text-sm text-muted-foreground">Fuel: {asset.telemetry.fuel_pct}%</span>
          )}
        </div>
        {asset.vehicleDetails && (
          <div className="text-sm text-muted-foreground space-y-1">
            <div>Plate: {asset.vehicleDetails.plateNumber}</div>
            <div>Type: {asset.vehicleDetails.vehicleType}</div>
            <div>Odometer: {asset.vehicleDetails.odometerKm.toLocaleString()} km</div>
            {asset.vehicleDetails.make && <div>Make/Model: {asset.vehicleDetails.make} {asset.vehicleDetails.model}</div>}
          </div>
        )}
      </Card>

      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-white mb-3">Driver assignment</h2>
        {current ? (
          <p className="text-sm text-foreground">Currently assigned to driver {current.driver_id}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No driver currently assigned.</p>
        )}
      </Card>
    </div>
  );
}
