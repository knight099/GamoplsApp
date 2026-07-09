"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Spinner } from "@gamopls/ui";
import * as fleetApi from "./api";
import { AddVehicleForm } from "./AddVehicleForm";
import { VehiclesTable } from "./VehiclesTable";
import type { Asset, CreateVehicleInput } from "./types";

export function VehiclesPanel() {
  const [vehicles, setVehicles] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fleetApi.listVehicles();
      setVehicles(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(input: CreateVehicleInput) {
    await fleetApi.createVehicle(input);
    await load();
  }

  return (
    <div className="space-y-8">
      <Card className="border border-border bg-card/40 p-6 backdrop-blur-sm">
        <AddVehicleForm onSubmit={handleCreate} />
      </Card>

      <Card className="border border-border bg-card p-6">
        <h2 className="text-lg font-bold text-white mb-4 border-b border-border/50 pb-2">Vehicles</h2>
        {loading && vehicles.length === 0 ? (
          <div className="flex justify-center py-8">
            <Spinner size={24} label="Loading vehicles" />
          </div>
        ) : error && vehicles.length === 0 ? (
          <p role="alert" className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 p-4 rounded-lg">
            {error}
          </p>
        ) : (
          <VehiclesTable vehicles={vehicles} />
        )}
      </Card>
    </div>
  );
}
