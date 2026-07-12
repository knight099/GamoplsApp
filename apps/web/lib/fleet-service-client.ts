/**
 * Direct server-to-server client for services/fleet's Fleet CRUD, used by
 * routes that need to create/read fleets as part of a larger operation
 * (signup, login, switch-fleet). apps/web never writes to the `fleets`
 * table directly — Fleet rows are owned exclusively by services/fleet,
 * reached only over HTTP, matching CLAUDE.md's module-boundary rule.
 */
export interface FleetServiceFleet {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
}

export class FleetServiceClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FleetServiceClientError";
  }
}

function baseUrl(): string {
  const url = process.env.FLEET_SERVICE_URL;
  if (!url) throw new FleetServiceClientError("FLEET_SERVICE_URL is not configured");
  return url.replace(/\/+$/, "");
}

export async function listOrgFleets(orgId: string): Promise<FleetServiceFleet[]> {
  const res = await fetch(`${baseUrl()}/fleets?org_id=${encodeURIComponent(orgId)}`);
  if (!res.ok) throw new FleetServiceClientError("Failed to list fleets", res.status);
  const body = (await res.json()) as { fleets: FleetServiceFleet[] };
  return body.fleets;
}

export async function createOrgFleet(orgId: string, name: string): Promise<FleetServiceFleet> {
  const res = await fetch(`${baseUrl()}/fleets?org_id=${encodeURIComponent(orgId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new FleetServiceClientError("Failed to create fleet", res.status);
  return (await res.json()) as FleetServiceFleet;
}

/** The org's earliest-created fleet. services/fleet's GET /fleets returns
 * newest-first (see prisma-fleet-repository.ts's `orderBy created_at
 * desc`), so the earliest one is the LAST element, not the first. */
export async function earliestOrgFleet(orgId: string): Promise<FleetServiceFleet | null> {
  const fleets = await listOrgFleets(orgId);
  return fleets.at(-1) ?? null;
}
