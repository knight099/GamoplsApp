import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import {
  SCOPE_HEADER_NAME,
  ScopeVerificationError,
  verifyScopeHeader,
  type TenantScope,
} from "@gamopls/auth";
import { registerAgentPlugin } from "./agent-registration-client.js";
import { InMemoryBoardRepository } from "./in-memory-repository.js";
import type { BoardRepository } from "./repository.js";
import { assignTaskToAsset, TaskNotFoundError } from "./task-assignment.js";
import {
  assignTaskInputSchema,
  createMissionBodySchema,
  createTaskBodySchema,
  updateMissionInputSchema,
  updateTaskInputSchema,
} from "./types.js";

export interface BuildAppOptions {
  repo?: BoardRepository;
  /** Base URL of services/registry, used by POST /agents/register. */
  registryUrl?: string;
  /** Injectable for tests — passed through to registerAgentPlugin. */
  registerAgentPluginFn?: typeof registerAgentPlugin;
  /** Overrides INTERNAL_SCOPE_SECRET for tests. */
  scopeSecret?: string;
}

/**
 * Tenant scope comes EXCLUSIVELY from the gateway-signed x-gamopls-scope
 * header (suggestions.md S-1) — never from query params or request bodies,
 * which any caller can set. Missing/invalid/expired header -> 401.
 */
function makeRequireScope(scopeSecret?: string) {
  return function requireScope(request: FastifyRequest, reply: FastifyReply): TenantScope | null {
    try {
      return verifyScopeHeader(request.headers[SCOPE_HEADER_NAME], { secret: scopeSecret });
    } catch (err) {
      if (err instanceof ScopeVerificationError) {
        reply.status(401).send({ error: "missing or invalid tenant scope" });
        return null;
      }
      throw err;
    }
  };
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
  const requireScope = makeRequireScope(options.scopeSecret);

  app.get("/health", async () => ({ status: "ok" }));

  // ---- Missions ----------------------------------------------------------

  app.post("/missions", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const parsed = createMissionBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid mission payload", details: parsed.error.flatten() });
    }
    const mission = await repo.createMission({
      org_id: scope.org_id,
      fleet_id: scope.fleet_id,
      ...parsed.data,
    });
    return reply.status(201).send(mission);
  });

  app.get("/missions", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const missions = await repo.listMissions(scope.org_id, scope.fleet_id);
    return reply.status(200).send({ missions });
  });

  app.get<{ Params: { id: string } }>("/missions/:id", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const mission = await repo.getMission(request.params.id, scope.org_id, scope.fleet_id);
    if (!mission) return reply.status(404).send({ error: "mission not found" });
    return reply.status(200).send(mission);
  });

  app.patch<{ Params: { id: string } }>("/missions/:id", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const parsed = updateMissionInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid mission patch", details: parsed.error.flatten() });
    }
    const mission = await repo.updateMission(
      request.params.id,
      scope.org_id,
      scope.fleet_id,
      parsed.data,
    );
    if (!mission) return reply.status(404).send({ error: "mission not found" });
    return reply.status(200).send(mission);
  });

  app.delete<{ Params: { id: string } }>("/missions/:id", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const deleted = await repo.deleteMission(request.params.id, scope.org_id, scope.fleet_id);
    if (!deleted) return reply.status(404).send({ error: "mission not found" });
    return reply.status(204).send();
  });

  // ---- Tasks --------------------------------------------------------------

  app.post("/tasks", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const parsed = createTaskBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid task payload", details: parsed.error.flatten() });
    }
    const task = await repo.createTask({
      org_id: scope.org_id,
      fleet_id: scope.fleet_id,
      ...parsed.data,
    });
    return reply.status(201).send(task);
  });

  app.get("/tasks", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const q = request.query as Record<string, unknown>;
    const mission_id = typeof q.mission_id === "string" ? q.mission_id : undefined;
    const tasks = await repo.listTasks(scope.org_id, scope.fleet_id, { mission_id });
    return reply.status(200).send({ tasks });
  });

  app.get<{ Params: { id: string } }>("/tasks/:id", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const task = await repo.getTask(request.params.id, scope.org_id, scope.fleet_id);
    if (!task) return reply.status(404).send({ error: "task not found" });
    return reply.status(200).send(task);
  });

  app.patch<{ Params: { id: string } }>("/tasks/:id", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const parsed = updateTaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid task patch", details: parsed.error.flatten() });
    }
    const task = await repo.updateTask(request.params.id, scope.org_id, scope.fleet_id, parsed.data);
    if (!task) return reply.status(404).send({ error: "task not found" });
    return reply.status(200).send(task);
  });

  app.delete<{ Params: { id: string } }>("/tasks/:id", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const deleted = await repo.deleteTask(request.params.id, scope.org_id, scope.fleet_id);
    if (!deleted) return reply.status(404).send({ error: "task not found" });
    return reply.status(204).send();
  });

  // Assignment: body is `{ asset_id: string | null }` — an opaque asset
  // reference. This route never inspects asset type.
  app.post<{ Params: { id: string } }>("/tasks/:id/assign", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const parsed = assignTaskInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid assignment payload", details: parsed.error.flatten() });
    }

    try {
      if (parsed.data.asset_id === null) {
        const task = await repo.assignTask(request.params.id, scope.org_id, scope.fleet_id, null);
        if (!task) return reply.status(404).send({ error: "task not found" });
        return reply.status(200).send(task);
      }

      const { task } = await assignTaskToAsset(
        repo,
        request.params.id,
        scope.org_id,
        scope.fleet_id,
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

  // Service-to-service registration, no tenant data — deliberately outside
  // the scope-header guard; hardening tracked separately (suggestions.md S-10).
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
