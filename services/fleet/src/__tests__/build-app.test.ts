import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../build-app.js";
import { InMemoryFleetRepository } from "../in-memory-fleet-repository.js";
import { InMemoryDriverRepository } from "../in-memory-driver-repository.js";
import { InMemoryAssetRepository } from "../in-memory-asset-repository.js";

class FakeVehiclePluginClient {
  private readonly store = new Map<string, any>();

  async createVehicleDetails(input: any) {
    const record = { ...input };
    this.store.set(input.assetId, record);
    return record;
  }

  async getVehicleDetails(assetId: string) {
    return this.store.get(assetId) ?? null;
  }
}

describe("fleet app — Fleet REST API", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({
      fleetRepo: new InMemoryFleetRepository(),
      driverRepo: new InMemoryDriverRepository(),
      assetRepo: new InMemoryAssetRepository(),
      vehiclePluginClient: new FakeVehiclePluginClient() as any,
    });
  });

  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("creates then lists fleets, tenant-scoped by org_id", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/fleets",
      payload: { org_id: "org-1", name: "Chennai Pilot Fleet" },
    });
    expect(createRes.statusCode).toBe(201);

    const listRes = await app.inject({ method: "GET", url: "/fleets?org_id=org-1" });
    expect(listRes.json().fleets).toHaveLength(1);

    const otherOrgRes = await app.inject({ method: "GET", url: "/fleets?org_id=org-2" });
    expect(otherOrgRes.json().fleets).toHaveLength(0);
  });

  it("rejects fleet creation with an empty name", async () => {
    const res = await app.inject({ method: "POST", url: "/fleets", payload: { org_id: "org-1", name: "" } });
    expect(res.statusCode).toBe(400);
  });

  it("creates, lists, and updates a driver", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/drivers",
      payload: { org_id: "org-1", fleet_id: "fleet-1", name: "Kumar S" },
    });
    expect(createRes.statusCode).toBe(201);
    const driver = createRes.json();
    expect(driver.status).toBe("active");

    const listRes = await app.inject({ method: "GET", url: "/drivers?org_id=org-1&fleet_id=fleet-1" });
    expect(listRes.json().drivers).toHaveLength(1);

    const updateRes = await app.inject({
      method: "PATCH",
      url: `/drivers/${driver.id}?org_id=org-1&fleet_id=fleet-1`,
      payload: { phone: "9876543210" },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().phone).toBe("9876543210");
  });

  it("rejects driver creation with an empty name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/drivers",
      payload: { org_id: "org-1", fleet_id: "fleet-1", name: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("onboards a vehicle asset, then lists and fetches it", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/assets",
      payload: {
        org_id: "org-1",
        fleet_id: "fleet-1",
        plateNumber: "TN-22-CD-9999",
        vehicleType: "van",
        fuelType: "diesel",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const asset = createRes.json();
    expect(asset.type).toBe("vehicle");
    expect(asset.vehicleDetails.plateNumber).toBe("TN-22-CD-9999");

    const listRes = await app.inject({ method: "GET", url: "/assets?org_id=org-1&fleet_id=fleet-1" });
    expect(listRes.json().assets).toHaveLength(1);

    const getRes = await app.inject({ method: "GET", url: `/assets/${asset.id}?org_id=org-1&fleet_id=fleet-1` });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().vehicleDetails.vehicleType).toBe("van");
  });

  it("rejects vehicle onboarding with an invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/assets",
      payload: { org_id: "org-1", fleet_id: "fleet-1" },
    });
    expect(res.statusCode).toBe(400);
  });
});
