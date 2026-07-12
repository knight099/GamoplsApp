import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOrgFleet, earliestOrgFleet, FleetServiceClientError, listOrgFleets } from "../fleet-service-client.js";

describe("fleet-service-client", () => {
  beforeEach(() => {
    process.env.FLEET_SERVICE_URL = "http://fleet.internal:4600";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FLEET_SERVICE_URL;
  });

  it("listOrgFleets fetches and returns the fleets array", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ fleets: [{ id: "f1", org_id: "org-1", name: "Main", created_at: "2026-01-01T00:00:00.000Z" }] }), { status: 200 }),
    );
    const fleets = await listOrgFleets("org-1");
    expect(fleets).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith("http://fleet.internal:4600/fleets?org_id=org-1");
  });

  it("listOrgFleets throws FleetServiceClientError on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    await expect(listOrgFleets("org-1")).rejects.toBeInstanceOf(FleetServiceClientError);
  });

  it("createOrgFleet POSTs to the fleet service and returns the created fleet", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "f1", org_id: "org-1", name: "Main Fleet", created_at: "2026-01-01T00:00:00.000Z" }), { status: 201 }),
    );
    const fleet = await createOrgFleet("org-1", "Main Fleet");
    expect(fleet.id).toBe("f1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://fleet.internal:4600/fleets?org_id=org-1");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Main Fleet" });
  });

  it("earliestOrgFleet returns the last element (services/fleet lists newest-first)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          fleets: [
            { id: "newest", org_id: "org-1", name: "B", created_at: "2026-02-01T00:00:00.000Z" },
            { id: "oldest", org_id: "org-1", name: "A", created_at: "2026-01-01T00:00:00.000Z" },
          ],
        }),
        { status: 200 },
      ),
    );
    const fleet = await earliestOrgFleet("org-1");
    expect(fleet?.id).toBe("oldest");
  });

  it("earliestOrgFleet returns null for an org with no fleets", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ fleets: [] }), { status: 200 }));
    expect(await earliestOrgFleet("org-1")).toBeNull();
  });
});
