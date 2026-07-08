"use client";

import { useState, type FormEvent } from "react";
import { Badge, Button, Card, DataTable, Spinner } from "@gamopls/ui";
import { createGeofence, deleteGeofence, MapApiError } from "./api";
import type { Geofence } from "./types";

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

/** Simple geofence create form + list, backed by `GET/POST/DELETE
 * /api/map/geofences`. No map-drawing UI in V1 — center/radius are typed
 * in as plain numbers, consistent with the "list view, not interactive
 * map" simplification for the whole page. */
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
    <Card>
      <h2 style={{ marginTop: 0 }}>Geofences</h2>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.5rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            aria-label="Geofence name"
            placeholder="Name"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            style={{ flex: "1 1 160px", padding: "0.4rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
          />
          <input
            aria-label="Asset ID"
            placeholder="Asset ID"
            value={form.asset_id}
            onChange={(e) => updateField("asset_id", e.target.value)}
            style={{ flex: "1 1 160px", padding: "0.4rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            aria-label="Center latitude"
            placeholder="Center lat"
            value={form.centerLat}
            onChange={(e) => updateField("centerLat", e.target.value)}
            style={{ flex: "1 1 120px", padding: "0.4rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
          />
          <input
            aria-label="Center longitude"
            placeholder="Center lng"
            value={form.centerLng}
            onChange={(e) => updateField("centerLng", e.target.value)}
            style={{ flex: "1 1 120px", padding: "0.4rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
          />
          <input
            aria-label="Radius meters"
            placeholder="Radius (m)"
            value={form.radiusMeters}
            onChange={(e) => updateField("radiusMeters", e.target.value)}
            style={{ flex: "1 1 120px", padding: "0.4rem", border: "1px solid #d1d5db", borderRadius: "0.25rem" }}
          />
        </div>
        {submitError && (
          <p role="alert" style={{ color: "#991b1b", margin: 0, fontSize: "0.875rem" }}>
            {submitError}
          </p>
        )}
        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Spinner size={14} label="Creating geofence" /> : "Add geofence"}
          </Button>
        </div>
      </form>

      {loading ? (
        <Spinner label="Loading geofences" />
      ) : error ? (
        <p role="alert" style={{ color: "#991b1b" }}>
          {error}
        </p>
      ) : (
        <DataTable
          columns={[
            { key: "name", header: "Name", render: (row: Geofence) => row.name },
            { key: "asset", header: "Asset", render: (row: Geofence) => <Badge>{row.asset_id}</Badge> },
            {
              key: "center",
              header: "Center",
              render: (row: Geofence) => `${row.centerLat.toFixed(5)}, ${row.centerLng.toFixed(5)}`,
            },
            { key: "radius", header: "Radius (m)", render: (row: Geofence) => String(row.radiusMeters) },
            {
              key: "actions",
              header: "",
              render: (row: Geofence) => (
                <Button
                  variant="danger"
                  onClick={() => handleDelete(row.id)}
                  disabled={deletingId === row.id}
                >
                  {deletingId === row.id ? "Removing…" : "Remove"}
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
