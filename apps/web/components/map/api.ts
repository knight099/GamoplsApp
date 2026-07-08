import type {
  FleetPositionsResponse,
  Geofence,
  GeofenceFormInput,
  GeofenceListResponse,
} from "./types";

/**
 * Thin fetch wrappers around `/api/map/...`. Per the gateway contract
 * (apps/web/lib/gateway-proxy.ts), these ALWAYS call the Next.js route
 * handler — never `services/map` directly — and org_id/fleet_id are
 * injected server-side from the caller's session, so we don't (and can't)
 * pass them ourselves except where the downstream REST shape requires a
 * literal value in the body/path (the gateway overwrites org_id/fleet_id
 * regardless of what's sent).
 */

export class MapApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MapApiError";
  }
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = typeof body?.error === "string" ? body.error : JSON.stringify(body);
    } catch {
      // ignore parse failure, fall back to statusText
    }
    throw new MapApiError(detail || response.statusText || "Request failed", response.status);
  }
  return (await response.json()) as T;
}

/** Current asset positions for the given fleet. `fleetId` comes from the
 * caller's own session claims (see app/map/page.tsx), it is only used to
 * fill the REST path segment — org/fleet scoping enforcement happens at
 * the gateway, not here. */
export async function fetchFleetPositions(fleetId: string): Promise<FleetPositionsResponse> {
  const response = await fetch(`/api/map/fleets/${encodeURIComponent(fleetId)}/positions`, {
    method: "GET",
    cache: "no-store",
  });
  return parseOrThrow<FleetPositionsResponse>(response);
}

export async function listGeofences(fleetId: string): Promise<Geofence[]> {
  const response = await fetch(`/api/map/geofences?fleet_id=${encodeURIComponent(fleetId)}`, {
    method: "GET",
    cache: "no-store",
  });
  const body = await parseOrThrow<GeofenceListResponse>(response);
  return body.geofences;
}

export async function createGeofence(input: GeofenceFormInput): Promise<Geofence> {
  const response = await fetch(`/api/map/geofences`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseOrThrow<Geofence>(response);
}

export async function deleteGeofence(id: string): Promise<void> {
  const response = await fetch(`/api/map/geofences/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 204) {
    await parseOrThrow(response);
  }
}
