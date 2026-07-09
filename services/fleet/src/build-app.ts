import Fastify, { type FastifyInstance } from "fastify";
import { InMemoryFleetRepository } from "./in-memory-fleet-repository.js";
import type { FleetRepository } from "./fleet-repository.js";
import { createFleetInputSchema } from "./types.js";

export interface BuildAppOptions {
  fleetRepo?: FleetRepository;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const fleetRepo = options.fleetRepo ?? new InMemoryFleetRepository();

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/fleets", async (request, reply) => {
    const parsed = createFleetInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid fleet payload", details: parsed.error.flatten() });
    }
    const fleet = await fleetRepo.create(parsed.data);
    return reply.status(201).send(fleet);
  });

  app.get("/fleets", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    if (typeof query.org_id !== "string" || query.org_id.length === 0) {
      return reply.status(400).send({ error: "org_id query param is required" });
    }
    const fleets = await fleetRepo.list(query.org_id);
    return reply.status(200).send({ fleets });
  });

  return app;
}
