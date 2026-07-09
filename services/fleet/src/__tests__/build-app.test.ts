import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../build-app.js";
import { InMemoryFleetRepository } from "../in-memory-fleet-repository.js";
import { InMemoryDriverRepository } from "../in-memory-driver-repository.js";
import { InMemoryAssetRepository } from "../in-memory-asset-repository.js";
import { InMemoryAssignmentRepository } from "../in-memory-assignment-repository.js";

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
      assignmentRepo: new InMemoryAssignmentRepository(),
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

  it("assigns a driver to a vehicle, reassigns, and tracks history", async () => {
    const assetRes = await app.inject({
      method: "POST",
      url: "/assets",
      payload: { org_id: "org-1", fleet_id: "fleet-1", plateNumber: "TN-05-EF-1111", vehicleType: "car", fuelType: "petrol" },
    });
    const asset = assetRes.json();

    const driverARes = await app.inject({
      method: "POST",
      url: "/drivers",
      payload: { org_id: "org-1", fleet_id: "fleet-1", name: "Driver A" },
    });
    const driverA = driverARes.json();

    const driverBRes = await app.inject({
      method: "POST",
      url: "/drivers",
      payload: { org_id: "org-1", fleet_id: "fleet-1", name: "Driver B" },
    });
    const driverB = driverBRes.json();

    const assignARes = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/assignments?org_id=org-1&fleet_id=fleet-1`,
      payload: { driver_id: driverA.id },
    });
    expect(assignARes.statusCode).toBe(201);
    expect(assignARes.json().unassigned_at).toBeNull();

    // Reassigning should close driver A's open assignment.
    const assignBRes = await app.inject({
      method: "POST",
      url: `/assets/${asset.id}/assignments?org_id=org-1&fleet_id=fleet-1`,
      payload: { driver_id: driverB.id },
    });
    expect(assignBRes.statusCode).toBe(201);

    const historyRes = await app.inject({
      method: "GET",
      url: `/assets/${asset.id}/assignments?org_id=org-1&fleet_id=fleet-1`,
    });
    const history = historyRes.json().assignments;
    expect(history).toHaveLength(2);
    expect(history.find((a: any) => a.driver_id === driverA.id).unassigned_at).not.toBeNull();
    expect(history.find((a: any) => a.driver_id === driverB.id).unassigned_at).toBeNull();

    const unassignRes = await app.inject({
      method: "DELETE",
      url: `/assets/${asset.id}/assignments/current?org_id=org-1&fleet_id=fleet-1`,
    });
    expect(unassignRes.statusCode).toBe(200);

    const historyAfterRes = await app.inject({
      method: "GET",
      url: `/assets/${asset.id}/assignments?org_id=org-1&fleet_id=fleet-1`,
    });
    expect(historyAfterRes.json().assignments.every((a: any) => a.unassigned_at !== null)).toBe(true);
  });
});
