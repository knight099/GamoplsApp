import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVehicle, FleetApiError, listVehicles } from "../api";

describe("fleet api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listVehicles parses the assets array", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ assets: [{ id: "asset-1" }] }),
    });
    const vehicles = await listVehicles();
    expect(vehicles).toEqual([{ id: "asset-1" }]);
  });

  it("createVehicle throws FleetApiError with the server's error message on failure", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: "invalid asset payload" }),
    });
    await expect(
      createVehicle({ plateNumber: "", vehicleType: "car", fuelType: "petrol" }),
    ).rejects.toThrow(FleetApiError);
  });
});
