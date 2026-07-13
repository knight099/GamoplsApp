import Fastify, { type FastifyInstance } from "fastify";
import { RegistryStore } from "./registry-store.js";
import { pluginRegistrationSchema } from "./schemas.js";
import type { IRegistryStore } from "./prisma-registry-store.js";

export interface BuildAppOptions {
  store?: IRegistryStore;
}

/**
 * Registers the plugin registry ("CORE") routes directly onto an existing
 * Fastify instance — the standalone-server path (`buildApp`) and the
 * combined backend (`services/backend`) both call this, so route logic
 * lives in one place regardless of how many processes are running.
 */
export function registerRegistryRoutes(app: FastifyInstance, options: BuildAppOptions = {}): void {
  const store = options.store ?? new RegistryStore();

  app.post("/plugins/register", async (request, reply) => {
    const parsed = pluginRegistrationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid registration payload",
        details: parsed.error.flatten(),
      });
    }

    const record = await store.register(parsed.data);
    return reply.status(201).send(record);
  });

  app.get("/plugins", async (_request, reply) => {
    const list = await store.list();
    return reply.status(200).send({ plugins: list });
  });
}

/**
 * Builds (but does not start listening) a standalone Fastify app for the
 * plugin registry ("CORE"). Kept separate from server.ts so tests can use
 * Fastify's `inject()` without binding a real port.
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  registerRegistryRoutes(app, options);
  return app;
}
