"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Spinner } from "@gamopls/ui";
import * as fleetApi from "./api";
import { AddDriverForm } from "./AddDriverForm";
import { DriversTable } from "./DriversTable";
import type { Asset, CreateDriverInput, Driver } from "./types";

export function DriversPanel() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [driversData, vehiclesData] = await Promise.all([fleetApi.listDrivers(), fleetApi.listVehicles()]);
      setDrivers(driversData);
      setVehicles(vehiclesData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drivers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(input: CreateDriverInput) {
    await fleetApi.createDriver(input);
    await load();
  }

  async function handleAssign(driverId: string, assetId: string) {
    await fleetApi.assignDriver(assetId, driverId);
    await load();
  }

  return (
    <div className="space-y-8">
      <Card className="border border-border bg-card/40 p-6 backdrop-blur-sm">
        <AddDriverForm onSubmit={handleCreate} />
      </Card>

      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-foreground mb-4 border-b border-border/50 pb-2">Drivers</h2>
        {loading && drivers.length === 0 ? (
          <div className="flex justify-center py-8">
            <Spinner size={24} label="Loading drivers" />
          </div>
        ) : error && drivers.length === 0 ? (
          <p role="alert" className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-4 rounded-lg">
            {error}
          </p>
        ) : (
          <DriversTable drivers={drivers} vehicles={vehicles} onAssign={handleAssign} />
        )}
      </Card>
    </div>
  );
}
