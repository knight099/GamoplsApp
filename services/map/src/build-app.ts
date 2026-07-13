import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import websocketPlugin from "@fastify/websocket";
import {
  SCOPE_HEADER_NAME,
  ScopeVerificationError,
  verifyScopeHeader,
  type TenantScope,
} from "@gamopls/auth";
import type { MapService } from "./map-service.js";
import { geofenceBodySchema, geofenceUpdateSchema } from "./geofence/types.js";

const assetMetadataSchema = {
  parse: (body: unknown) => {
    const obj = body as {
      type?: unknown;
      mapIcon?: unknown;
      displayLabel?: unknown;
      pluginMetadata?: unknown;
    };
    if (
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
      type: obj.type,
      mapIcon: obj.mapIcon,
      displayLabel: obj.displayLabel,
      pluginMetadata: (obj.pluginMetadata as Record<string, unknown> | undefined) ?? {},
    };
  },
};

export interface BuildAppOptions {
  /** Overrides INTERNAL_SCOPE_SECRET for tests. */
  scopeSecret?: string;
}

/**
 * Tenant scope comes EXCLUSIVELY from the gateway-signed x-gamopls-scope
 * header (suggestions.md S-1/S-3) — never from query params, path params,
 * or request bodies, which any caller can set. Missing/invalid/expired
 * header -> 401.
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
 * Registers the map routes directly onto an existing Fastify instance —
 * the standalone-server path (`buildApp`) and the combined backend
 * (`services/backend`) both call this, so route logic lives in one
 * place regardless of how many processes are running.
 *
 * Routes:
 *  - Geofence CRUD: POST/GET/PUT/DELETE `/geofences`
 *  - Asset metadata (identity/rendering hints, see map-service.ts):
 *    PUT `/assets/:assetId/metadata`
 *  - Current positions sync read: GET `/fleets/:fleetId/positions`
 *  - WebSocket live stream: GET `/ws/fleets/:fleetId/positions`
 *
 * Cross-tenant access to a geofence by id is indistinguishable from a
 * missing one (404); a positions read whose path fleet differs from the
 * scope fleet is rejected with 403.
 */
export async function registerMapRoutes(
  app: FastifyInstance,
  mapService: MapService,
  options: BuildAppOptions = {},
): Promise<void> {
  await app.register(websocketPlugin);
  const requireScope = makeRequireScope(options.scopeSecret);

  /** Load a geofence only if it belongs to the caller's tenant scope. */
  function loadScopedGeofence(id: string, scope: TenantScope) {
    const geofence = mapService.geofenceStore.get(id);
    if (!geofence || geofence.org_id !== scope.org_id || geofence.fleet_id !== scope.fleet_id) {
      return null;
    }
    return geofence;
  }

  app.post("/geofences", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const parsed = geofenceBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid geofence payload", details: parsed.error.flatten() });
    }
    const geofence = mapService.geofenceStore.create({
      ...parsed.data,
      org_id: scope.org_id,
      fleet_id: scope.fleet_id,
    });
    return reply.status(201).send(geofence);
  });

  app.get("/geofences", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const query = request.query as { asset_id?: string };
    const geofences = mapService.geofenceStore.list({
      org_id: scope.org_id,
      fleet_id: scope.fleet_id,
      asset_id: query.asset_id,
    });
    return reply.status(200).send({ geofences });
  });

  app.get("/geofences/:id", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const { id } = request.params as { id: string };
    const geofence = loadScopedGeofence(id, scope);
    if (!geofence) return reply.status(404).send({ error: "geofence not found" });
    return reply.status(200).send(geofence);
  });

  app.put("/geofences/:id", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const { id } = request.params as { id: string };
    if (!loadScopedGeofence(id, scope)) {
      return reply.status(404).send({ error: "geofence not found" });
    }
    const parsed = geofenceUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid geofence payload", details: parsed.error.flatten() });
    }
    const updated = mapService.geofenceStore.update(id, parsed.data);
    if (!updated) return reply.status(404).send({ error: "geofence not found" });
    return reply.status(200).send(updated);
  });

  app.delete("/geofences/:id", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const { id } = request.params as { id: string };
    if (!loadScopedGeofence(id, scope)) {
      return reply.status(404).send({ error: "geofence not found" });
    }
    const deleted = mapService.geofenceStore.delete(id);
    if (!deleted) return reply.status(404).send({ error: "geofence not found" });
    return reply.status(204).send();
  });

  app.put("/assets/:assetId/metadata", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const { assetId } = request.params as { assetId: string };
    const parsed = assetMetadataSchema.parse(request.body);
    if (!parsed) {
      return reply.status(400).send({ error: "invalid asset metadata payload" });
    }
    const snapshot = await mapService.setAssetMetadata(assetId, scope.org_id, scope.fleet_id, {
      type: parsed.type,
      mapIcon: parsed.mapIcon,
      displayLabel: parsed.displayLabel,
      pluginMetadata: parsed.pluginMetadata,
    });
    return reply.status(200).send(snapshot);
  });

  app.get("/fleets/:fleetId/positions", async (request, reply) => {
    const scope = requireScope(request, reply);
    if (!scope) return reply;
    const { fleetId } = request.params as { fleetId: string };
    if (fleetId !== scope.fleet_id) {
      return reply.status(403).send({ error: "fleet scope mismatch" });
    }
    const markers = await mapService.getFleetMarkers(fleetId);
    return reply.status(200).send({ fleet_id: fleetId, positions: markers });
  });

  app.register(async (scoped) => {
    scoped.get(
      "/ws/fleets/:fleetId/positions",
      { websocket: true },
      async (socket, request) => {
        // Same tenant-scope rule as the REST positions route (S-3): the
        // upgrade request must carry a valid gateway-signed scope header,
        // and the path fleet must match the scope fleet. 1008 = policy
        // violation.
        let scope: TenantScope;
        try {
          scope = verifyScopeHeader(request.headers[SCOPE_HEADER_NAME], {
            secret: options.scopeSecret,
          });
        } catch {
          socket.close(1008, "missing or invalid tenant scope");
          return;
        }
        const { fleetId } = request.params as { fleetId: string };
        if (fleetId !== scope.fleet_id) {
          socket.close(1008, "fleet scope mismatch");
          return;
        }

        const initial = await mapService.getFleetMarkers(fleetId);
        socket.send(JSON.stringify({ fleet_id: fleetId, positions: initial }));

        const unsubscribe = mapService.broadcaster.subscribe(fleetId, (markers) => {
          socket.send(JSON.stringify({ fleet_id: fleetId, positions: markers }));
        });

        socket.on("close", () => unsubscribe());
      },
    );
  });
}

/**
 * Builds (but does not start listening) a standalone Fastify app for
 * `services/map`. Kept separate from `server.ts` so tests can use
 * `.inject()` for REST routes without binding a real port, mirroring
 * `services/registry`.
 */
export async function buildApp(
  mapService: MapService,
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerMapRoutes(app, mapService, options);
  return app;
}
