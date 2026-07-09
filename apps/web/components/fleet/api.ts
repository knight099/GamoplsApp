import type {
  Asset,
  CreateDriverInput,
  CreateVehicleInput,
  Driver,
  DriverAssignment,
  Fleet,
} from "./types";

export class FleetApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FleetApiError";
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
    throw new FleetApiError(detail || response.statusText || "Request failed", response.status);
  }
  return (await response.json()) as T;
}

export async function listFleets(): Promise<Fleet[]> {
  const res = await fetch("/api/fleet/fleets");
  const data = await parseOrThrow<{ fleets: Fleet[] }>(res);
  return data.fleets;
}

export async function createFleet(name: string): Promise<Fleet> {
  const res = await fetch("/api/fleet/fleets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return parseOrThrow<Fleet>(res);
}

export async function listVehicles(): Promise<Asset[]> {
  const res = await fetch("/api/fleet/assets");
  const data = await parseOrThrow<{ assets: Asset[] }>(res);
  return data.assets;
}

export async function createVehicle(input: CreateVehicleInput): Promise<Asset> {
  const res = await fetch("/api/fleet/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseOrThrow<Asset>(res);
}

export async function listDrivers(): Promise<Driver[]> {
  const res = await fetch("/api/fleet/drivers");
  const data = await parseOrThrow<{ drivers: Driver[] }>(res);
  return data.drivers;
}

export async function createDriver(input: CreateDriverInput): Promise<Driver> {
  const res = await fetch("/api/fleet/drivers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseOrThrow<Driver>(res);
}

export async function updateDriver(id: string, patch: Partial<CreateDriverInput>): Promise<Driver> {
  const res = await fetch(`/api/fleet/drivers/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseOrThrow<Driver>(res);
}

export async function assignDriver(assetId: string, driverId: string): Promise<DriverAssignment> {
  const res = await fetch(`/api/fleet/assets/${assetId}/assignments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ driver_id: driverId }),
  });
  return parseOrThrow<DriverAssignment>(res);
}

export async function unassignCurrentDriver(assetId: string): Promise<DriverAssignment> {
  const res = await fetch(`/api/fleet/assets/${assetId}/assignments/current`, { method: "DELETE" });
  return parseOrThrow<DriverAssignment>(res);
}

export async function listAssignmentHistory(assetId: string): Promise<DriverAssignment[]> {
  const res = await fetch(`/api/fleet/assets/${assetId}/assignments`);
  const data = await parseOrThrow<{ assignments: DriverAssignment[] }>(res);
  return data.assignments;
}
