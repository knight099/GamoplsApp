import Fastify, { type FastifyInstance } from "fastify";
import { registerAgentPlugin } from "./agent-registration-client.js";
import { InMemoryBoardRepository } from "./in-memory-repository.js";
import type { BoardRepository } from "./repository.js";
import { assignTaskToAsset, TaskNotFoundError } from "./task-assignment.js";
import {
  assignTaskInputSchema,
  createMissionInputSchema,
  createTaskInputSchema,
  updateMissionInputSchema,
  updateTaskInputSchema,
} from "./types.js";

export interface BuildAppOptions {
  repo?: BoardRepository;
  /** Base URL of services/registry, used by POST /agents/register. */
  registryUrl?: string;
  /** Injectable for tests — passed through to registerAgentPlugin. */
  registerAgentPluginFn?: typeof registerAgentPlugin;
}

function tenancyQuerySchema(query: unknown): { org_id: string; fleet_id: string } | null {
  if (typeof query !== "object" || query === null) return null;
  const q = query as Record<string, unknown>;
  if (typeof q.org_id !== "string" || typeof q.fleet_id !== "string") return null;
  if (q.org_id.length === 0 || q.fleet_id.length === 0) return null;
  return { org_id: q.org_id, fleet_id: q.fleet_id };
}

/**
 * Builds (but does not start listening) the Fastify app for services/board.
 * Kept separate from server.ts so tests can use `.inject()` without
 * binding a real port, and so composition (which repository, which
 * registry URL) happens at the call site rather than being hardcoded.
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const repo = options.repo ?? new InMemoryBoardRepository();
  const registryUrl = options.registryUrl ?? process.env.REGISTRY_URL ?? "http://localhost:4400";
  const doRegisterAgentPlugin = options.registerAgentPluginFn ?? registerAgentPlugin;

  app.get("/health", async () => ({ status: "ok" }));

  // ---- Missions ----------------------------------------------------------

  app.post("/missions", async (request, reply) => {
    const parsed = createMissionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid mission payload", details: parsed.error.flatten() });
    }
    const mission = await repo.createMission(parsed.data);
    return reply.status(201).send(mission);
  });

  app.get("/missions", async (request, reply) => {
    const tenancy = tenancyQuerySchema(request.query);
    if (!tenancy) {
      return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    }
    const missions = await repo.listMissions(tenancy.org_id, tenancy.fleet_id);
    return reply.status(200).send({ missions });
  });

  app.get<{ Params: { id: string } }>("/missions/:id", async (request, reply) => {
    const tenancy = tenancyQuerySchema(request.query);
    if (!tenancy) {
      return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    }
    const mission = await repo.getMission(request.params.id, tenancy.org_id, tenancy.fleet_id);
    if (!mission) return reply.status(404).send({ error: "mission not found" });
    return reply.status(200).send(mission);
  });

  app.patch<{ Params: { id: string } }>("/missions/:id", async (request, reply) => {
    const tenancy = tenancyQuerySchema(request.query);
    if (!tenancy) {
      return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    }
    const parsed = updateMissionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid mission patch", details: parsed.error.flatten() });
    }
    const mission = await repo.updateMission(
      request.params.id,
      tenancy.org_id,
      tenancy.fleet_id,
      parsed.data,
    );
    if (!mission) return reply.status(404).send({ error: "mission not found" });
    return reply.status(200).send(mission);
  });

  app.delete<{ Params: { id: string } }>("/missions/:id", async (request, reply) => {
    const tenancy = tenancyQuerySchema(request.query);
    if (!tenancy) {
      return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    }
    const deleted = await repo.deleteMission(request.params.id, tenancy.org_id, tenancy.fleet_id);
    if (!deleted) return reply.status(404).send({ error: "mission not found" });
    return reply.status(204).send();
  });

  // ---- Tasks --------------------------------------------------------------

  app.post("/tasks", async (request, reply) => {
    const parsed = createTaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid task payload", details: parsed.error.flatten() });
    }
    const task = await repo.createTask(parsed.data);
    return reply.status(201).send(task);
  });

  app.get("/tasks", async (request, reply) => {
    const tenancy = tenancyQuerySchema(request.query);
    if (!tenancy) {
      return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    }
    const q = request.query as Record<string, unknown>;
    const mission_id = typeof q.mission_id === "string" ? q.mission_id : undefined;
    const tasks = await repo.listTasks(tenancy.org_id, tenancy.fleet_id, { mission_id });
    return reply.status(200).send({ tasks });
  });

  app.get<{ Params: { id: string } }>("/tasks/:id", async (request, reply) => {
    const tenancy = tenancyQuerySchema(request.query);
    if (!tenancy) {
      return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    }
    const task = await repo.getTask(request.params.id, tenancy.org_id, tenancy.fleet_id);
    if (!task) return reply.status(404).send({ error: "task not found" });
    return reply.status(200).send(task);
  });

  app.patch<{ Params: { id: string } }>("/tasks/:id", async (request, reply) => {
    const tenancy = tenancyQuerySchema(request.query);
    if (!tenancy) {
      return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    }
    const parsed = updateTaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid task patch", details: parsed.error.flatten() });
    }
    const task = await repo.updateTask(request.params.id, tenancy.org_id, tenancy.fleet_id, parsed.data);
    if (!task) return reply.status(404).send({ error: "task not found" });
    return reply.status(200).send(task);
  });

  app.delete<{ Params: { id: string } }>("/tasks/:id", async (request, reply) => {
    const tenancy = tenancyQuerySchema(request.query);
    if (!tenancy) {
      return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    }
    const deleted = await repo.deleteTask(request.params.id, tenancy.org_id, tenancy.fleet_id);
    if (!deleted) return reply.status(404).send({ error: "task not found" });
    return reply.status(204).send();
  });

  // Assignment: body is `{ asset_id: string | null }` — an opaque asset
  // reference. This route never inspects asset type.
  app.post<{ Params: { id: string } }>("/tasks/:id/assign", async (request, reply) => {
    const tenancy = tenancyQuerySchema(request.query);
    if (!tenancy) {
      return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    }
    const parsed = assignTaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid assignment payload", details: parsed.error.flatten() });
    }

    try {
      if (parsed.data.asset_id === null) {
        const task = await repo.assignTask(request.params.id, tenancy.org_id, tenancy.fleet_id, null);
        if (!task) return reply.status(404).send({ error: "task not found" });
        return reply.status(200).send(task);
      }

      const { task } = await assignTaskToAsset(
        repo,
        request.params.id,
        tenancy.org_id,
        tenancy.fleet_id,
        { id: parsed.data.asset_id, assignedTaskId: null },
      );
      return reply.status(200).send(task);
    } catch (err) {
      if (err instanceof TaskNotFoundError) {
        return reply.status(404).send({ error: "task not found" });
      }
      throw err;
    }
  });

  // ---- AI Agent plugin registration (forwarded to services/registry) ----

  app.post("/agents/register", async (request, reply) => {
    const body = request.body as { capabilities?: unknown; endpoint?: unknown } | undefined;
    if (
      !body ||
      !Array.isArray(body.capabilities) ||
      body.capabilities.length === 0 ||
      typeof body.endpoint !== "string" ||
      body.endpoint.length === 0
    ) {
      return reply.status(400).send({ error: "capabilities (string[]) and endpoint (string) are required" });
    }

    try {
      await doRegisterAgentPlugin(registryUrl, {
        capabilities: body.capabilities as string[],
        endpoint: body.endpoint,
      });
      return reply.status(201).send({ registered: true, type: "ai-agent" });
    } catch (err) {
      request.log?.error?.(err);
      return reply.status(502).send({ error: "failed to register with plugin registry" });
    }
  });

  return app;
}
