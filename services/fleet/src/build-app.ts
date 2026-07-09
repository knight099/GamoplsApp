import Fastify, { type FastifyInstance } from "fastify";
import { InMemoryFleetRepository } from "./in-memory-fleet-repository.js";
import type { FleetRepository } from "./fleet-repository.js";
import { InMemoryDriverRepository } from "./in-memory-driver-repository.js";
import type { DriverRepository } from "./driver-repository.js";
import { createFleetInputSchema, createDriverInputSchema, updateDriverInputSchema } from "./types.js";

export interface BuildAppOptions {
  fleetRepo?: FleetRepository;
  driverRepo?: DriverRepository;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const fleetRepo = options.fleetRepo ?? new InMemoryFleetRepository();
  const driverRepo = options.driverRepo ?? new InMemoryDriverRepository();

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

  function tenancyQuery(query: unknown): { org_id: string; fleet_id: string } | null {
    if (typeof query !== "object" || query === null) return null;
    const q = query as Record<string, unknown>;
    if (typeof q.org_id !== "string" || typeof q.fleet_id !== "string") return null;
    if (q.org_id.length === 0 || q.fleet_id.length === 0) return null;
    return { org_id: q.org_id, fleet_id: q.fleet_id };
  }

  app.post("/drivers", async (request, reply) => {
    const parsed = createDriverInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid driver payload", details: parsed.error.flatten() });
    }
    const driver = await driverRepo.create(parsed.data);
    return reply.status(201).send(driver);
  });

  app.get("/drivers", async (request, reply) => {
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const drivers = await driverRepo.list(tenancy.org_id, tenancy.fleet_id);
    return reply.status(200).send({ drivers });
  });

  app.patch("/drivers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const parsed = updateDriverInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid driver payload", details: parsed.error.flatten() });
    }
    const driver = await driverRepo.update(id, tenancy.org_id, tenancy.fleet_id, parsed.data);
    if (!driver) return reply.status(404).send({ error: "not found" });
    return reply.status(200).send(driver);
  });

  return app;
}
