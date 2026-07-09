import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../build-app.js";
import { InMemoryFleetRepository } from "../in-memory-fleet-repository.js";

describe("fleet app — Fleet REST API", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({ fleetRepo: new InMemoryFleetRepository() });
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
});
