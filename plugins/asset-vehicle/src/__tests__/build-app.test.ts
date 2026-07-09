import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../build-app.js";
import { InMemoryVehicleDetailsRepository } from "../in-memory-vehicle-details-repository.js";

describe("asset-vehicle app — VehicleDetails REST API", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({ repo: new InMemoryVehicleDetailsRepository() });
  });

  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("creates then fetches vehicle details", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/vehicle-details",
      payload: {
        assetId: "asset-1",
        plateNumber: "TN-09-AB-1234",
        vehicleType: "van",
        fuelType: "petrol",
      },
    });
    expect(createRes.statusCode).toBe(201);
    expect(createRes.json().plateNumber).toBe("TN-09-AB-1234");

    const getRes = await app.inject({ method: "GET", url: "/vehicle-details/asset-1" });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().vehicleType).toBe("van");
  });

  it("returns 404 for an unknown assetId", async () => {
    const res = await app.inject({ method: "GET", url: "/vehicle-details/nonexistent" });
    expect(res.statusCode).toBe(404);
  });

  it("rejects an invalid create payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/vehicle-details",
      payload: { assetId: "asset-1" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("updates odometer via PATCH", async () => {
    await app.inject({
      method: "POST",
      url: "/vehicle-details",
      payload: { assetId: "asset-2", plateNumber: "TN-01-XY-0001", vehicleType: "car", fuelType: "electric" },
    });
    const patchRes = await app.inject({
      method: "PATCH",
      url: "/vehicle-details/asset-2",
      payload: { odometerKm: 4200 },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().odometerKm).toBe(4200);
  });

  it("creates and lists maintenance records for an asset", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/maintenance-records",
      payload: {
        assetId: "asset-1",
        serviceType: "oil_change",
        performedAt: "2026-06-01T00:00:00.000Z",
        odometerAtServiceKm: 15000,
      },
    });
    expect(createRes.statusCode).toBe(201);

    const listRes = await app.inject({ method: "GET", url: "/maintenance-records/asset-1" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().records).toHaveLength(1);
    expect(listRes.json().records[0].serviceType).toBe("oil_change");
  });
});
