import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../build-app.js";

describe("registry app", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp();
  });

  it("registers a plugin then lists it via GET /plugins (round trip)", async () => {
    const registerResponse = await app.inject({
      method: "POST",
      url: "/plugins/register",
      payload: {
        type: "vehicle",
        capabilities: ["locatable", "monitorable", "alertable"],
        endpoint: "http://asset-vehicle:3100",
      },
    });

    expect(registerResponse.statusCode).toBe(201);
    const registered = registerResponse.json();
    expect(registered).toMatchObject({
      type: "vehicle",
      capabilities: ["locatable", "monitorable", "alertable"],
      endpoint: "http://asset-vehicle:3100",
    });
    expect(registered.id).toBeTruthy();
    expect(registered.registeredAt).toBeTruthy();

    const listResponse = await app.inject({ method: "GET", url: "/plugins" });
    expect(listResponse.statusCode).toBe(200);
    const body = listResponse.json();
    expect(body.plugins).toHaveLength(1);
    expect(body.plugins[0]).toMatchObject({
      type: "vehicle",
      capabilities: ["locatable", "monitorable", "alertable"],
      endpoint: "http://asset-vehicle:3100",
    });
  });

  it("returns an empty list when nothing is registered", async () => {
    const response = await app.inject({ method: "GET", url: "/plugins" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ plugins: [] });
  });

  it("upserts on re-registration of the same type+endpoint instead of duplicating", async () => {
    const payload = {
      type: "vehicle",
      capabilities: ["locatable"],
      endpoint: "http://asset-vehicle:3100",
    };

    await app.inject({ method: "POST", url: "/plugins/register", payload });
    const second = await app.inject({
      method: "POST",
      url: "/plugins/register",
      payload: { ...payload, capabilities: ["locatable", "monitorable"] },
    });
    expect(second.statusCode).toBe(201);

    const listResponse = await app.inject({ method: "GET", url: "/plugins" });
    const body = listResponse.json();
    expect(body.plugins).toHaveLength(1);
    expect(body.plugins[0].capabilities).toEqual(["locatable", "monitorable"]);
  });

  it("supports multiple distinct plugin types", async () => {
    await app.inject({
      method: "POST",
      url: "/plugins/register",
      payload: { type: "vehicle", capabilities: ["locatable"], endpoint: "http://a:3100" },
    });
    await app.inject({
      method: "POST",
      url: "/plugins/register",
      payload: { type: "drone", capabilities: ["locatable", "taskable"], endpoint: "http://b:3200" },
    });

    const listResponse = await app.inject({ method: "GET", url: "/plugins" });
    const body = listResponse.json();
    expect(body.plugins).toHaveLength(2);
    expect(body.plugins.map((p: { type: string }) => p.type).sort()).toEqual(["drone", "vehicle"]);
  });

  it.each([
    ["missing type", { capabilities: ["locatable"], endpoint: "http://a:3100" }],
    ["missing capabilities", { type: "vehicle", endpoint: "http://a:3100" }],
    ["empty capabilities array", { type: "vehicle", capabilities: [], endpoint: "http://a:3100" }],
    ["missing endpoint", { type: "vehicle", capabilities: ["locatable"] }],
    ["empty type string", { type: "", capabilities: ["locatable"], endpoint: "http://a:3100" }],
    ["capabilities not an array", { type: "vehicle", capabilities: "locatable", endpoint: "http://a:3100" }],
  ])("returns 4xx for malformed registration body: %s", async (_label, payload) => {
    const response = await app.inject({ method: "POST", url: "/plugins/register", payload });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
  });

  it("returns 4xx for a completely empty body", async () => {
    const response = await app.inject({ method: "POST", url: "/plugins/register", payload: {} });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);
  });
});
