import Fastify, { type FastifyInstance } from "fastify";
import { InMemoryFleetRepository } from "./in-memory-fleet-repository.js";
import type { FleetRepository } from "./fleet-repository.js";
import { InMemoryDriverRepository } from "./in-memory-driver-repository.js";
import type { DriverRepository } from "./driver-repository.js";
import { InMemoryAssetRepository } from "./in-memory-asset-repository.js";
import type { AssetRepository } from "./asset-repository.js";
import { VehiclePluginClient, VehiclePluginClientError } from "./vehicle-plugin-client.js";
import type { VehiclePluginClient as VehiclePluginClientType } from "./vehicle-plugin-client.js";
import { InMemoryAssignmentRepository } from "./in-memory-assignment-repository.js";
import type { AssignmentRepository } from "./assignment-repository.js";
import {
  createFleetInputSchema,
  createDriverInputSchema,
  updateDriverInputSchema,
  createVehicleAssetInputSchema,
  assignDriverInputSchema,
} from "./types.js";

export interface BuildAppOptions {
  fleetRepo?: FleetRepository;
  driverRepo?: DriverRepository;
  assetRepo?: AssetRepository;
  assignmentRepo?: AssignmentRepository;
  vehiclePluginClient?: VehiclePluginClientType;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const fleetRepo = options.fleetRepo ?? new InMemoryFleetRepository();
  const driverRepo = options.driverRepo ?? new InMemoryDriverRepository();
  const assetRepo = options.assetRepo ?? new InMemoryAssetRepository();
  const assignmentRepo = options.assignmentRepo ?? new InMemoryAssignmentRepository();
  const vehiclePluginClient =
    options.vehiclePluginClient ??
    new VehiclePluginClient({ baseUrl: process.env.VEHICLE_PLUGIN_URL ?? "http://localhost:4700" });

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/fleets", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    if (typeof query.org_id !== "string" || query.org_id.length === 0) {
      return reply.status(400).send({ error: "org_id query param is required" });
    }
    const parsed = createFleetInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid fleet payload", details: parsed.error.flatten() });
    }
    const fleet = await fleetRepo.create({ org_id: query.org_id, ...parsed.data });
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
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const parsed = createDriverInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid driver payload", details: parsed.error.flatten() });
    }
    const driver = await driverRepo.create({ org_id: tenancy.org_id, fleet_id: tenancy.fleet_id, ...parsed.data });
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

  app.post("/assets", async (request, reply) => {
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const parsed = createVehicleAssetInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid asset payload", details: parsed.error.flatten() });
    }
    const input = parsed.data;
    const asset = await assetRepo.create({
      org_id: tenancy.org_id,
      fleet_id: tenancy.fleet_id,
      type: "vehicle",
      display_label: `${input.plateNumber} (${input.vehicleType})`,
    });

    try {
      const vehicleDetails = await vehiclePluginClient.createVehicleDetails({
        assetId: asset.id,
        plateNumber: input.plateNumber,
        vehicleType: input.vehicleType,
        fuelType: input.fuelType,
        make: input.make,
        model: input.model,
        color: input.color,
        year: input.year,
        vin: input.vin,
        fuelCapacityLiters: input.fuelCapacityLiters,
        odometerKm: input.odometerKm,
      });
      return reply.status(201).send({ ...asset, vehicleDetails });
    } catch (err) {
      // Compensating action: don't leave an orphaned Asset with no vehicle details.
      await assetRepo.delete(asset.id);
      if (err instanceof VehiclePluginClientError) {
        return reply.status(502).send({ error: "failed to create vehicle details", detail: err.message });
      }
      throw err;
    }
  });

  app.get("/assets", async (request, reply) => {
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const assets = await assetRepo.list(tenancy.org_id, tenancy.fleet_id);
    return reply.status(200).send({ assets });
  });

  app.get("/assets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const asset = await assetRepo.get(id, tenancy.org_id, tenancy.fleet_id);
    if (!asset) return reply.status(404).send({ error: "not found" });
    const vehicleDetails = asset.type === "vehicle" ? await vehiclePluginClient.getVehicleDetails(id) : null;
    return reply.status(200).send({ ...asset, vehicleDetails });
  });

  app.post("/assets/:id/assignments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const parsed = assignDriverInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid assignment payload", details: parsed.error.flatten() });
    }
    const asset = await assetRepo.get(id, tenancy.org_id, tenancy.fleet_id);
    if (!asset) return reply.status(404).send({ error: "asset not found" });
    const driver = await driverRepo.get(parsed.data.driver_id, tenancy.org_id, tenancy.fleet_id);
    if (!driver) return reply.status(404).send({ error: "driver not found" });

    const assignment = await assignmentRepo.assign(tenancy.org_id, tenancy.fleet_id, id, parsed.data.driver_id);
    return reply.status(201).send(assignment);
  });

  app.delete("/assets/:id/assignments/current", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const closed = await assignmentRepo.unassignCurrent(tenancy.org_id, tenancy.fleet_id, id);
    if (!closed) return reply.status(404).send({ error: "no open assignment for this asset" });
    return reply.status(200).send(closed);
  });

  app.get("/assets/:id/assignments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenancy = tenancyQuery(request.query);
    if (!tenancy) return reply.status(400).send({ error: "org_id and fleet_id query params are required" });
    const assignments = await assignmentRepo.history(tenancy.org_id, tenancy.fleet_id, id);
    return reply.status(200).send({ assignments });
  });

  return app;
}
