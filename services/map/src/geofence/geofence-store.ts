import { randomUUID } from "node:crypto";
import type { Geofence, GeofenceInput, GeofenceUpdate } from "./types.js";

/**
 * In-memory geofence CRUD store (V1 choice, deliberate — see Phase 4.1
 * report: geofence counts per pilot fleet are small and this keeps the
 * service dependency-free the same way `services/registry`'s
 * `RegistryStore` does; swap for a Postgres-backed repository behind this
 * same interface later without touching callers).
 */
export class GeofenceStore {
  private readonly geofences = new Map<string, Geofence>();

  create(input: GeofenceInput): Geofence {
    const now = new Date().toISOString();
    const geofence: Geofence = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.geofences.set(geofence.id, geofence);
    return geofence;
  }

  get(id: string): Geofence | null {
    return this.geofences.get(id) ?? null;
  }

  update(id: string, patch: GeofenceUpdate): Geofence | null {
    const existing = this.geofences.get(id);
    if (!existing) return null;
    const updated: Geofence = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.geofences.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.geofences.delete(id);
  }

  list(filter?: { org_id?: string; fleet_id?: string; asset_id?: string }): Geofence[] {
    return Array.from(this.geofences.values()).filter((g) => {
      if (filter?.org_id && g.org_id !== filter.org_id) return false;
      if (filter?.fleet_id && g.fleet_id !== filter.fleet_id) return false;
      if (filter?.asset_id && g.asset_id !== filter.asset_id) return false;
      return true;
    });
  }

  /** Geofences assigned to a specific asset — used by the exit detector. */
  listByAsset(assetId: string): Geofence[] {
    return this.list({ asset_id: assetId });
  }

  clear(): void {
    this.geofences.clear();
  }
}
