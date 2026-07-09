import Fastify, { type FastifyInstance } from "fastify";
import { InMemoryVehicleDetailsRepository } from "./in-memory-vehicle-details-repository.js";
import type { VehicleDetailsRepository } from "./vehicle-details-repository.js";
import { createVehicleDetailsInputSchema, updateVehicleDetailsInputSchema } from "./schemas.js";

export interface BuildAppOptions {
  repo?: VehicleDetailsRepository;
}

/**
 * Builds (but does not start listening) the Fastify app for this plugin's
 * VehicleDetails HTTP API. services/fleet is the only intended caller —
 * this is not exposed through apps/web's gateway (CLAUDE.md: plugins are
 * separate deployable services, reached over the network by module
 * services, never imported directly).
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const repo = options.repo ?? new InMemoryVehicleDetailsRepository();

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/vehicle-details", async (request, reply) => {
    const parsed = createVehicleDetailsInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid payload", details: parsed.error.flatten() });
    }
    const record = await repo.create(parsed.data);
    return reply.status(201).send(record);
  });

  app.get("/vehicle-details/:assetId", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const record = await repo.get(assetId);
    if (!record) return reply.status(404).send({ error: "not found" });
    return reply.status(200).send(record);
  });

  app.patch("/vehicle-details/:assetId", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const parsed = updateVehicleDetailsInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid payload", details: parsed.error.flatten() });
    }
    const record = await repo.update(assetId, parsed.data);
    if (!record) return reply.status(404).send({ error: "not found" });
    return reply.status(200).send(record);
  });

  return app;
}
