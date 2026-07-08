import Fastify, { type FastifyInstance } from "fastify";
import websocketPlugin from "@fastify/websocket";
import type { MapService } from "./map-service.js";
import { geofenceInputSchema, geofenceUpdateSchema } from "./geofence/types.js";

const assetMetadataSchema = {
  parse: (body: unknown) => {
    const obj = body as {
      org_id?: unknown;
      fleet_id?: unknown;
      type?: unknown;
      mapIcon?: unknown;
      displayLabel?: unknown;
      pluginMetadata?: unknown;
    };
    if (
      typeof obj?.org_id !== "string" ||
      obj.org_id.length === 0 ||
      typeof obj?.fleet_id !== "string" ||
      obj.fleet_id.length === 0 ||
      typeof obj?.type !== "string" ||
      obj.type.length === 0 ||
      typeof obj?.mapIcon !== "string" ||
      obj.mapIcon.length === 0 ||
      typeof obj?.displayLabel !== "string" ||
      obj.displayLabel.length === 0
    ) {
      return null;
    }
    return {
      org_id: obj.org_id,
      fleet_id: obj.fleet_id,
      type: obj.type,
      mapIcon: obj.mapIcon,
      displayLabel: obj.displayLabel,
      pluginMetadata: (obj.pluginMetadata as Record<string, unknown> | undefined) ?? {},
    };
  },
};

/**
 * Builds (but does not start listening) the Fastify app for `services/map`.
 * Kept separate from `server.ts` so tests can use `.inject()` for REST
 * routes without binding a real port, mirroring `services/registry`.
 *
 * Routes:
 *  - Geofence CRUD: POST/GET/PUT/DELETE `/geofences`
 *  - Asset metadata (identity/rendering hints, see map-service.ts):
 *    PUT `/assets/:assetId/metadata`
 *  - Current positions sync read: GET `/fleets/:fleetId/positions`
 *  - WebSocket live stream: GET `/ws/fleets/:fleetId/positions`
 */
export async function buildApp(mapService: MapService): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(websocketPlugin);

  app.post("/geofences", async (request, reply) => {
    const parsed = geofenceInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid geofence payload", details: parsed.error.flatten() });
    }
    const geofence = mapService.geofenceStore.create(parsed.data);
    return reply.status(201).send(geofence);
  });

  app.get("/geofences", async (request, reply) => {
    const query = request.query as { fleet_id?: string; asset_id?: string };
    const geofences = mapService.geofenceStore.list({
      fleet_id: query.fleet_id,
      asset_id: query.asset_id,
    });
    return reply.status(200).send({ geofences });
  });

  app.get("/geofences/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const geofence = mapService.geofenceStore.get(id);
    if (!geofence) return reply.status(404).send({ error: "geofence not found" });
    return reply.status(200).send(geofence);
  });

  app.put("/geofences/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = geofenceUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid geofence payload", details: parsed.error.flatten() });
    }
    const updated = mapService.geofenceStore.update(id, parsed.data);
    if (!updated) return reply.status(404).send({ error: "geofence not found" });
    return reply.status(200).send(updated);
  });

  app.delete("/geofences/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = mapService.geofenceStore.delete(id);
    if (!deleted) return reply.status(404).send({ error: "geofence not found" });
    return reply.status(204).send();
  });

  app.put("/assets/:assetId/metadata", async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const parsed = assetMetadataSchema.parse(request.body);
    if (!parsed) {
      return reply.status(400).send({ error: "invalid asset metadata payload" });
    }
    const snapshot = await mapService.setAssetMetadata(assetId, parsed.org_id, parsed.fleet_id, {
      type: parsed.type,
      mapIcon: parsed.mapIcon,
      displayLabel: parsed.displayLabel,
      pluginMetadata: parsed.pluginMetadata,
    });
    return reply.status(200).send(snapshot);
  });

  app.get("/fleets/:fleetId/positions", async (request, reply) => {
    const { fleetId } = request.params as { fleetId: string };
    const markers = await mapService.getFleetMarkers(fleetId);
    return reply.status(200).send({ fleet_id: fleetId, positions: markers });
  });

  app.register(async (scoped) => {
    scoped.get(
      "/ws/fleets/:fleetId/positions",
      { websocket: true },
      async (socket, request) => {
        const { fleetId } = request.params as { fleetId: string };

        const initial = await mapService.getFleetMarkers(fleetId);
        socket.send(JSON.stringify({ fleet_id: fleetId, positions: initial }));

        const unsubscribe = mapService.broadcaster.subscribe(fleetId, (markers) => {
          socket.send(JSON.stringify({ fleet_id: fleetId, positions: markers }));
        });

        socket.on("close", () => unsubscribe());
      },
    );
  });

  return app;
}
