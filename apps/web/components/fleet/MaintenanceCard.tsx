"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Spinner } from "@gamopls/ui";
import * as fleetApi from "./api";
import type { MaintenanceRecord } from "./types";

const SERVICE_TYPES: MaintenanceRecord["serviceType"][] = ["oil_change", "brake_inspection", "tire_rotation", "general_service"];

export interface MaintenanceCardProps {
  assetId: string;
  currentOdometerKm: number;
}

export function MaintenanceCard({ assetId, currentOdometerKm }: MaintenanceCardProps) {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceType, setServiceType] = useState<MaintenanceRecord["serviceType"]>("oil_change");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await fleetApi.listMaintenanceRecords(assetId));
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleLog() {
    setSubmitting(true);
    try {
      await fleetApi.logMaintenance(assetId, {
        serviceType,
        performedAt: new Date().toISOString(),
        odometerAtServiceKm: currentOdometerKm,
      });
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border border-border bg-card p-6 space-y-4">
      <h2 className="text-lg font-bold text-white">Maintenance</h2>

      <div className="flex items-center gap-2">
        <select
          aria-label="Service type"
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value as MaintenanceRecord["serviceType"])}
          className="h-8 px-2 rounded-md bg-background/50 border border-border text-xs text-foreground"
        >
          {SERVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Button type="button" disabled={submitting} onClick={() => void handleLog()} style={{ padding: "0.4rem 0.75rem", fontSize: "0.75rem" }}>
          {submitting ? "Logging…" : "Log maintenance"}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner size={20} label="Loading maintenance history" />
        </div>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
          No maintenance logged yet.
        </p>
      ) : (
        <ul className="space-y-1">
          {records.map((r) => (
            <li key={r.id} className="text-sm text-muted-foreground">
              {r.serviceType} — {r.odometerAtServiceKm.toLocaleString()} km ({new Date(r.performedAt).toLocaleDateString()})
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
