import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../build-app.js";
import { InMemoryBoardRepository } from "../in-memory-repository.js";
import type { registerAgentPlugin } from "../agent-registration-client.js";

describe("board app — Mission/Task REST API", () => {
  let app: FastifyInstance;
  let repo: InMemoryBoardRepository;

  beforeEach(() => {
    repo = new InMemoryBoardRepository();
    app = buildApp({ repo });
  });

  it("GET /health returns ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("creates a mission then lists it (tenant-scoped)", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/missions",
      payload: { org_id: "org-1", fleet_id: "fleet-1", title: "Pilot mission", description: "" },
    });
    expect(createRes.statusCode).toBe(201);
    const mission = createRes.json();
    expect(mission.status).toBe("active");

    const listRes = await app.inject({
      method: "GET",
      url: "/missions?org_id=org-1&fleet_id=fleet-1",
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().missions).toHaveLength(1);

    const crossTenantRes = await app.inject({
      method: "GET",
      url: "/missions?org_id=org-2&fleet_id=fleet-1",
    });
    expect(crossTenantRes.json().missions).toHaveLength(0);
  });

  it("rejects mission creation with an invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/missions",
      payload: { org_id: "org-1", fleet_id: "fleet-1", title: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("full Task CRUD + assignment round trip via HTTP", async () => {
    const missionRes = await app.inject({
      method: "POST",
      url: "/missions",
      payload: { org_id: "org-1", fleet_id: "fleet-1", title: "Mission A" },
    });
    const mission = missionRes.json();

    const createTaskRes = await app.inject({
      method: "POST",
      url: "/tasks",
      payload: {
        org_id: "org-1",
        fleet_id: "fleet-1",
        mission_id: mission.id,
        title: "Inspect vehicle",
        description: "",
      },
    });
    expect(createTaskRes.statusCode).toBe(201);
    const task = createTaskRes.json();
    expect(task.status).toBe("open");
    expect(task.asset_id).toBeNull();

    const getRes = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}?org_id=org-1&fleet_id=fleet-1`,
    });
    expect(getRes.statusCode).toBe(200);

    const assignRes = await app.inject({
      method: "POST",
      url: `/tasks/${task.id}/assign?org_id=org-1&fleet_id=fleet-1`,
      payload: { asset_id: "asset-42" },
    });
    expect(assignRes.statusCode).toBe(200);
    expect(assignRes.json().asset_id).toBe("asset-42");

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/tasks/${task.id}?org_id=org-1&fleet_id=fleet-1`,
      payload: { status: "done" },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().status).toBe("done");

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/tasks/${task.id}?org_id=org-1&fleet_id=fleet-1`,
    });
    expect(deleteRes.statusCode).toBe(204);

    const afterDeleteRes = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}?org_id=org-1&fleet_id=fleet-1`,
    });
    expect(afterDeleteRes.statusCode).toBe(404);
  });

  it("returns 404 assigning a nonexistent task", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/tasks/nonexistent/assign?org_id=org-1&fleet_id=fleet-1",
      payload: { asset_id: "asset-1" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("requires org_id/fleet_id query params on scoped GET routes", async () => {
    const res = await app.inject({ method: "GET", url: "/tasks" });
    expect(res.statusCode).toBe(400);
  });
});

describe("board app — AI Agent plugin registration (forwarded to services/registry)", () => {
  it("POST /agents/register forwards to the registry with type 'ai-agent'", async () => {
    const registerAgentPluginFn = vi.fn(
      async (
        _registryUrl: string,
        _metadata: Parameters<typeof registerAgentPlugin>[1],
      ) => undefined,
    );

    const app = buildApp({
      repo: new InMemoryBoardRepository(),
      registryUrl: "http://registry.local",
      registerAgentPluginFn: registerAgentPluginFn as unknown as typeof registerAgentPlugin,
    });

    const res = await app.inject({
      method: "POST",
      url: "/agents/register",
      payload: { capabilities: ["task-suggestion"], endpoint: "http://ai-agent.local" },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ registered: true, type: "ai-agent" });
    expect(registerAgentPluginFn).toHaveBeenCalledWith("http://registry.local", {
      capabilities: ["task-suggestion"],
      endpoint: "http://ai-agent.local",
    });
  });

  it("returns 400 for a malformed agent registration payload", async () => {
    const app = buildApp({ repo: new InMemoryBoardRepository() });
    const res = await app.inject({ method: "POST", url: "/agents/register", payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("returns 502 when the registry is unreachable", async () => {
    const registerAgentPluginFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    const app = buildApp({
      repo: new InMemoryBoardRepository(),
      registerAgentPluginFn: registerAgentPluginFn as unknown as typeof registerAgentPlugin,
    });

    const res = await app.inject({
      method: "POST",
      url: "/agents/register",
      payload: { capabilities: ["task-suggestion"], endpoint: "http://ai-agent.local" },
    });
    expect(res.statusCode).toBe(502);
  });
});
