import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeofence, deleteGeofence, fetchFleetPositions, listGeofences, MapApiError } from "../api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fetchFleetPositions", () => {
  it("calls the gateway route with the fleet id in the path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ fleet_id: "fleet-1", positions: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchFleetPositions("fleet-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/map/fleets/fleet-1/positions",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result).toEqual({ fleet_id: "fleet-1", positions: [] });
  });

  it("throws MapApiError with the backend's error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "fleet not found" }), { status: 404 }),
      ),
    );

    await expect(fetchFleetPositions("missing")).rejects.toMatchObject({
      name: "MapApiError",
      status: 404,
      message: "fleet not found",
    });
    await expect(fetchFleetPositions("missing")).rejects.toBeInstanceOf(MapApiError);
  });
});

describe("listGeofences", () => {
  it("requests geofences scoped to the fleet_id query param", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ geofences: [{ id: "g1" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listGeofences("fleet-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/map/geofences?fleet_id=fleet-1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result).toEqual([{ id: "g1" }]);
  });
});

describe("createGeofence", () => {
  it("POSTs to /api/map/geofences with a JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "g1", name: "Depot" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const input = {
      org_id: "",
      fleet_id: "fleet-1",
      asset_id: "asset-1",
      name: "Depot",
      centerLat: 1,
      centerLng: 2,
      radiusMeters: 100,
    };
    const result = await createGeofence(input);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/map/geofences",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
    expect(result).toEqual({ id: "g1", name: "Depot" });
  });
});

describe("deleteGeofence", () => {
  it("DELETEs the geofence by id and resolves on 204", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteGeofence("g1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/map/geofences/g1", expect.objectContaining({ method: "DELETE" }));
  });
});
