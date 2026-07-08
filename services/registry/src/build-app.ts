import Fastify, { type FastifyInstance } from "fastify";
import { RegistryStore } from "./registry-store.js";
import { pluginRegistrationSchema } from "./schemas.js";

/**
 * Builds (but does not start listening) the Fastify app for the plugin
 * registry ("CORE"). Kept separate from server.ts so tests can use
 * Fastify's `inject()` without binding a real port.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  const store = new RegistryStore();

  app.post("/plugins/register", async (request, reply) => {
    const parsed = pluginRegistrationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid registration payload",
        details: parsed.error.flatten(),
      });
    }

    const record = store.register(parsed.data);
    return reply.status(201).send(record);
  });

  app.get("/plugins", async (_request, reply) => {
    return reply.status(200).send({ plugins: store.list() });
  });

  return app;
}
