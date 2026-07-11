import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { SCOPE_HEADER_NAME, signScopeHeader } from "@gamopls/auth";
import { buildApp } from "../build-app.js";
import { InMemoryBoardRepository } from "../in-memory-repository.js";
import type { registerAgentPlugin } from "../agent-registration-client.js";

const SCOPE_SECRET = "board-test-secret";
const scopeHeaders = (org_id = "org-1", fleet_id = "fleet-1") => ({
  [SCOPE_HEADER_NAME]: signScopeHeader({ org_id, fleet_id }, { secret: SCOPE_SECRET }),
});

describe("board app — Mission/Task REST API", () => {
  let app: FastifyInstance;
  let repo: InMemoryBoardRepository;

  beforeEach(() => {
    repo = new InMemoryBoardRepository();
    app = buildApp({ repo, scopeSecret: SCOPE_SECRET });
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
      headers: scopeHeaders("org-1", "fleet-1"),
      payload: { title: "Pilot mission", description: "" },
    });
    expect(createRes.statusCode).toBe(201);
    const mission = createRes.json();
    expect(mission.status).toBe("active");
    expect(mission).toMatchObject({ org_id: "org-1", fleet_id: "fleet-1" });

    const listRes = await app.inject({
      method: "GET",
      url: "/missions",
      headers: scopeHeaders("org-1", "fleet-1"),
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().missions).toHaveLength(1);

    const crossTenantRes = await app.inject({
      method: "GET",
      url: "/missions",
      headers: scopeHeaders("org-2", "fleet-1"),
    });
    expect(crossTenantRes.json().missions).toHaveLength(0);
  });

  it("rejects mission creation with an invalid payload", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/missions",
      headers: scopeHeaders(),
      payload: { title: "" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("full Task CRUD + assignment round trip via HTTP", async () => {
    const missionRes = await app.inject({
      method: "POST",
      url: "/missions",
      headers: scopeHeaders(),
      payload: { title: "Mission A" },
    });
    const mission = missionRes.json();

    const createTaskRes = await app.inject({
      method: "POST",
      url: "/tasks",
      headers: scopeHeaders(),
      payload: {
        mission_id: mission.id,
        title: "Inspect vehicle",
        description: "",
      },
    });
    expect(createTaskRes.statusCode).toBe(201);
    const task = createTaskRes.json();
    expect(task.status).toBe("open");
    expect(task.asset_id).toBeNull();
    expect(task).toMatchObject({ org_id: "org-1", fleet_id: "fleet-1" });

    const getRes = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}`,
      headers: scopeHeaders(),
    });
    expect(getRes.statusCode).toBe(200);

    const assignRes = await app.inject({
      method: "POST",
      url: `/tasks/${task.id}/assign`,
      headers: scopeHeaders(),
      payload: { asset_id: "asset-42" },
    });
    expect(assignRes.statusCode).toBe(200);
    expect(assignRes.json().asset_id).toBe("asset-42");

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/tasks/${task.id}`,
      headers: scopeHeaders(),
      payload: { status: "done" },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().status).toBe("done");

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/tasks/${task.id}`,
      headers: scopeHeaders(),
    });
    expect(deleteRes.statusCode).toBe(204);

    const afterDeleteRes = await app.inject({
      method: "GET",
      url: `/tasks/${task.id}`,
      headers: scopeHeaders(),
    });
    expect(afterDeleteRes.statusCode).toBe(404);
  });

  it("returns 404 assigning a nonexistent task", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/tasks/nonexistent/assign",
      headers: scopeHeaders(),
      payload: { asset_id: "asset-1" },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("board app — tenant scope enforcement (S-1)", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({ repo: new InMemoryBoardRepository(), scopeSecret: SCOPE_SECRET });
  });

  it("rejects requests without a scope header with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/missions" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a scope header signed with the wrong secret", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/missions",
      headers: {
        [SCOPE_HEADER_NAME]: signScopeHeader(
          { org_id: "org-1", fleet_id: "fleet-1" },
          { secret: "evil" },
        ),
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("creates missions in the header scope and ignores spoofed body tenancy", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/missions",
      headers: scopeHeaders("org-1", "fleet-1"),
      payload: { title: "Patrol", org_id: "org-EVIL", fleet_id: "fleet-EVIL" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ org_id: "org-1", fleet_id: "fleet-1" });
  });

  it("ignores query-param tenancy in favor of the header", async () => {
    await app.inject({
      method: "POST",
      url: "/missions",
      headers: scopeHeaders("org-1", "fleet-1"),
      payload: { title: "Mine" },
    });
    const crossRead = await app.inject({
      method: "GET",
      url: "/missions?org_id=org-1&fleet_id=fleet-1", // attacker-style query
      headers: scopeHeaders("org-2", "fleet-2"),
    });
    expect(crossRead.statusCode).toBe(200);
    expect(crossRead.json().missions).toEqual([]);
  });

  it("hides another org's mission behind 404 on by-id routes", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/missions",
      headers: scopeHeaders("org-1", "fleet-1"),
      payload: { title: "Secret" },
    });
    const id = created.json().id;
    for (const [method, url] of [
      ["GET", `/missions/${id}`],
      ["PATCH", `/missions/${id}`],
      ["DELETE", `/missions/${id}`],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        headers: scopeHeaders("org-2", "fleet-2"),
        ...(method === "PATCH" ? { payload: { title: "stolen" } } : {}),
      });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
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
