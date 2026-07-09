"use client";

import { useState, type FormEvent } from "react";
import { Badge, Button, Card, DataTable, Spinner } from "@gamopls/ui";
import { createGeofence, deleteGeofence, MapApiError } from "./api";
import type { Geofence } from "./types";
import { Input } from "../ui/input";
import { ShieldAlert, Trash2 } from "lucide-react";

export interface GeofencePanelProps {
  fleetId: string;
  geofences: Geofence[];
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}

interface FormState {
  asset_id: string;
  name: string;
  centerLat: string;
  centerLng: string;
  radiusMeters: string;
}

const EMPTY_FORM: FormState = {
  asset_id: "",
  name: "",
  centerLat: "",
  centerLng: "",
  radiusMeters: "",
};

export function GeofencePanel({ fleetId, geofences, loading, error, onChanged }: GeofencePanelProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const centerLat = Number(form.centerLat);
    const centerLng = Number(form.centerLng);
    const radiusMeters = Number(form.radiusMeters);
    if (!form.name.trim() || !form.asset_id.trim()) {
      setSubmitError("Name and asset ID are required.");
      return;
    }
    if (Number.isNaN(centerLat) || Number.isNaN(centerLng) || Number.isNaN(radiusMeters)) {
      setSubmitError("Latitude, longitude, and radius must be numbers.");
      return;
    }

    setSubmitting(true);
    try {
      await createGeofence({
        org_id: "", // overwritten by the gateway from the session JWT
        fleet_id: fleetId,
        asset_id: form.asset_id.trim(),
        name: form.name.trim(),
        centerLat,
        centerLng,
        radiusMeters,
      });
      setForm(EMPTY_FORM);
      onChanged();
    } catch (err) {
      setSubmitError(err instanceof MapApiError ? err.message : "Failed to create geofence.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteGeofence(id);
      onChanged();
    } catch {
      // surfaced via onChanged's next fetch failing, if it's a real problem
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card className="border border-border bg-card p-6">
      <h2 className="text-lg font-bold text-foreground mb-4 border-b border-border/50 pb-2">Geofence Boundaries</h2>

      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Boundary Name</span>
            <Input
              aria-label="Geofence name"
              placeholder="e.g. North Zone"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Target Asset ID</span>
            <Input
              aria-label="Asset ID"
              placeholder="e.g. box-chennai-01"
              value={form.asset_id}
              onChange={(e) => updateField("asset_id", e.target.value)}
              className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Center Lat</span>
            <Input
              aria-label="Center latitude"
              placeholder="e.g. 13.0827"
              value={form.centerLat}
              onChange={(e) => updateField("centerLat", e.target.value)}
              className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Center Lng</span>
            <Input
              aria-label="Center longitude"
              placeholder="e.g. 80.2707"
              value={form.centerLng}
              onChange={(e) => updateField("centerLng", e.target.value)}
              className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Radius (meters)</span>
            <Input
              aria-label="Radius meters"
              placeholder="e.g. 500"
              value={form.radiusMeters}
              onChange={(e) => updateField("radiusMeters", e.target.value)}
              className="bg-background/50 border-border text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        {submitError && (
          <div className="flex items-center gap-2 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <div>
          <Button type="submit" disabled={submitting} variant="primary">
            {submitting ? <Spinner size={14} label="Creating geofence" /> : "Deploy Boundary"}
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner size={24} label="Loading geofences" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
        <DataTable
          columns={[
            { key: "name", header: "Name", render: (row: Geofence) => <span className="font-semibold text-foreground">{row.name}</span> },
            { key: "asset", header: "Asset", render: (row: Geofence) => <Badge tone="info">{row.asset_id}</Badge> },
            {
              key: "center",
              header: "Center Position",
              render: (row: Geofence) => `${row.centerLat.toFixed(5)}, ${row.centerLng.toFixed(5)}`,
            },
            { key: "radius", header: "Radius (m)", render: (row: Geofence) => <span className="font-mono">{row.radiusMeters}</span> },
            {
              key: "actions",
              header: "",
              render: (row: Geofence) => (
                <Button
                  variant="danger"
                  onClick={() => handleDelete(row.id)}
                  disabled={deletingId === row.id}
                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  {deletingId === row.id ? "Deleting" : "Delete"}
                </Button>
              ),
            },
          ]}
          rows={geofences}
          getRowKey={(row) => row.id}
          emptyState="No geofences defined for this fleet yet."
        />
      )}
    </Card>
  );
}
