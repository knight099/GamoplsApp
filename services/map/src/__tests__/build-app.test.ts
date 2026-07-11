import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { EventPublisher } from "@gamopls/event-schemas";
import { SCOPE_HEADER_NAME, signScopeHeader } from "@gamopls/auth";
import { buildApp } from "../build-app.js";
import { MapService } from "../map-service.js";
import { InMemoryPositionCache } from "../cache/in-memory-position-cache.js";

function noopPublisher(): EventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

const SCOPE_SECRET = "map-test-secret";
const scopeHeaders = (org_id = "org-1", fleet_id = "fleet-1") => ({
  [SCOPE_HEADER_NAME]: signScopeHeader({ org_id, fleet_id }, { secret: SCOPE_SECRET }),
});

const GEOFENCE_BODY = {
  asset_id: "asset-1",
  name: "Depot",
  centerLat: 13.0827,
  centerLng: 80.2707,
  radiusMeters: 250,
};

describe("map app REST routes", () => {
  let app: FastifyInstance;
  let mapService: MapService;

  beforeEach(async () => {
    mapService = new MapService(new InMemoryPositionCache(), noopPublisher());
    app = await buildApp(mapService, { scopeSecret: SCOPE_SECRET });
  });

  describe("geofence CRUD", () => {
    it("creates then reads back a geofence", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/geofences",
        headers: scopeHeaders(),
        payload: GEOFENCE_BODY,
      });
      expect(createRes.statusCode).toBe(201);
      const created = createRes.json();
      expect(created.id).toBeTruthy();
      expect(created.name).toBe("Depot");
      expect(created).toMatchObject({ org_id: "org-1", fleet_id: "fleet-1" });

      const getRes = await app.inject({
        method: "GET",
        url: `/geofences/${created.id}`,
        headers: scopeHeaders(),
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json()).toMatchObject({ name: "Depot", radiusMeters: 250 });
    });

    it("lists only the scope fleet's geofences", async () => {
      await app.inject({
        method: "POST",
        url: "/geofences",
        headers: scopeHeaders("org-1", "fleet-1"),
        payload: { ...GEOFENCE_BODY, name: "Zone A", asset_id: "asset-1" },
      });
      await app.inject({
        method: "POST",
        url: "/geofences",
        headers: scopeHeaders("org-1", "fleet-2"),
        payload: { ...GEOFENCE_BODY, name: "Zone B", asset_id: "asset-2" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/geofences",
        headers: scopeHeaders("org-1", "fleet-1"),
      });
      const body = res.json();
      expect(body.geofences).toHaveLength(1);
      expect(body.geofences[0].name).toBe("Zone A");
    });

    it("updates a geofence", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/geofences",
        headers: scopeHeaders(),
        payload: GEOFENCE_BODY,
      });
      const { id } = createRes.json();

      const updateRes = await app.inject({
        method: "PUT",
        url: `/geofences/${id}`,
        headers: scopeHeaders(),
        payload: { radiusMeters: 500 },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().radiusMeters).toBe(500);
    });

    it("returns 404 updating/getting/deleting a nonexistent geofence", async () => {
      const getRes = await app.inject({
        method: "GET",
        url: "/geofences/does-not-exist",
        headers: scopeHeaders(),
      });
      expect(getRes.statusCode).toBe(404);

      const putRes = await app.inject({
        method: "PUT",
        url: "/geofences/does-not-exist",
        headers: scopeHeaders(),
        payload: { radiusMeters: 10 },
      });
      expect(putRes.statusCode).toBe(404);

      const deleteRes = await app.inject({
        method: "DELETE",
        url: "/geofences/does-not-exist",
        headers: scopeHeaders(),
      });
      expect(deleteRes.statusCode).toBe(404);
    });

    it("deletes a geofence", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/geofences",
        headers: scopeHeaders(),
        payload: GEOFENCE_BODY,
      });
      const { id } = createRes.json();

      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/geofences/${id}`,
        headers: scopeHeaders(),
      });
      expect(deleteRes.statusCode).toBe(204);

      const getRes = await app.inject({
        method: "GET",
        url: `/geofences/${id}`,
        headers: scopeHeaders(),
      });
      expect(getRes.statusCode).toBe(404);
    });

    it("returns 400 for an invalid geofence payload", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/geofences",
        headers: scopeHeaders(),
        payload: { name: "missing everything else" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("asset metadata + positions read", () => {
    it("sets asset metadata then returns it via the fleet positions endpoint after a location update", async () => {
      const metaRes = await app.inject({
        method: "PUT",
        url: "/assets/asset-1/metadata",
        headers: scopeHeaders(),
        payload: {
          type: "vehicle",
          mapIcon: "truck-icon",
          displayLabel: "Truck 1",
        },
      });
      expect(metaRes.statusCode).toBe(200);

      await mapService.handleLocationUpdate({
        type: "AssetLocationUpdated",
        org_id: "org-1",
        fleet_id: "fleet-1",
        asset_id: "asset-1",
        lat: 12.9,
        lng: 80.2,
        timestamp: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "GET",
        url: "/fleets/fleet-1/positions",
        headers: scopeHeaders(),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.positions).toHaveLength(1);
      expect(body.positions[0]).toMatchObject({
        id: "asset-1",
        icon: "truck-icon",
        label: "Truck 1",
        lat: 12.9,
        lng: 80.2,
      });
    });

    it("returns an empty positions list for a fleet with no cached assets", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/fleets/empty-fleet/positions",
        headers: scopeHeaders("org-1", "empty-fleet"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ fleet_id: "empty-fleet", positions: [] });
    });

    it("defaults icon/label when no metadata was set before a location update", async () => {
      await mapService.handleLocationUpdate({
        type: "AssetLocationUpdated",
        org_id: "org-1",
        fleet_id: "fleet-1",
        asset_id: "asset-2",
        lat: 1,
        lng: 1,
        timestamp: new Date().toISOString(),
      });

      const res = await app.inject({
        method: "GET",
        url: "/fleets/fleet-1/positions",
        headers: scopeHeaders(),
      });
      const body = res.json();
      expect(body.positions[0]).toMatchObject({ id: "asset-2", icon: "generic-asset-marker" });
    });
  });

  describe("tenant scope enforcement (S-1/S-3/S-4)", () => {
    it("401s geofence and position routes without a scope header", async () => {
      for (const [method, url] of [
        ["POST", "/geofences"],
        ["GET", "/geofences"],
        ["GET", "/geofences/g1"],
        ["PUT", "/geofences/g1"],
        ["DELETE", "/geofences/g1"],
        ["PUT", "/assets/a1/metadata"],
        ["GET", "/fleets/fleet-1/positions"],
      ] as const) {
        const res = await app.inject({ method, url, payload: {} });
        expect(res.statusCode, `${method} ${url}`).toBe(401);
      }
    });

    it("creates a geofence from a tenancy-free body under the header scope (S-4 regression)", async () => {
      // exactly the body GeofencePanel sends
      const res = await app.inject({
        method: "POST",
        url: "/geofences",
        headers: scopeHeaders("org-1", "fleet-1"),
        payload: GEOFENCE_BODY,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ org_id: "org-1", fleet_id: "fleet-1", name: "Depot" });
    });

    it("hides another tenant's geofence behind 404 (S-3 IDOR)", async () => {
      const created = await app.inject({
        method: "POST",
        url: "/geofences",
        headers: scopeHeaders("org-1", "fleet-1"),
        payload: GEOFENCE_BODY,
      });
      const id = created.json().id;
      for (const [method, url, payload] of [
        ["GET", `/geofences/${id}`, undefined],
        ["PUT", `/geofences/${id}`, { name: "stolen" }],
        ["DELETE", `/geofences/${id}`, undefined],
      ] as const) {
        const res = await app.inject({
          method,
          url,
          payload,
          headers: scopeHeaders("org-2", "fleet-2"),
        });
        expect(res.statusCode, `${method} ${url}`).toBe(404);
      }
      // still intact for the owner
      const still = await app.inject({
        method: "GET",
        url: `/geofences/${id}`,
        headers: scopeHeaders("org-1", "fleet-1"),
      });
      expect(still.statusCode).toBe(200);
    });

    it("lists only the scope tenant's geofences and ignores query fleet_id", async () => {
      await app.inject({
        method: "POST",
        url: "/geofences",
        headers: scopeHeaders("org-1", "fleet-1"),
        payload: GEOFENCE_BODY,
      });
      const res = await app.inject({
        method: "GET",
        url: "/geofences?fleet_id=fleet-1",
        headers: scopeHeaders("org-2", "fleet-2"),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().geofences).toEqual([]);
    });

    it("rejects update payloads that try to move a geofence across tenants", async () => {
      const created = await app.inject({
        method: "POST",
        url: "/geofences",
        headers: scopeHeaders("org-1", "fleet-1"),
        payload: GEOFENCE_BODY,
      });
      const res = await app.inject({
        method: "PUT",
        url: `/geofences/${created.json().id}`,
        headers: scopeHeaders("org-1", "fleet-1"),
        payload: { org_id: "org-2", name: "renamed" },
      });
      expect(res.statusCode).toBe(200);
      // zod strips the unknown org_id key; tenancy is immutable
      expect(res.json()).toMatchObject({ org_id: "org-1", name: "renamed" });
    });

    it("403s a positions read for a fleet outside the caller's scope (S-3)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/fleets/fleet-OTHER/positions",
        headers: scopeHeaders("org-1", "fleet-1"),
      });
      expect(res.statusCode).toBe(403);
      const ok = await app.inject({
        method: "GET",
        url: "/fleets/fleet-1/positions",
        headers: scopeHeaders("org-1", "fleet-1"),
      });
      expect(ok.statusCode).toBe(200);
    });

    it("stores asset metadata under the header scope, not body tenancy", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/assets/asset-9/metadata",
        headers: scopeHeaders("org-1", "fleet-1"),
        payload: {
          type: "vehicle",
          mapIcon: "truck",
          displayLabel: "T-9",
          org_id: "org-EVIL",
          fleet_id: "fleet-EVIL",
        },
      });
      expect(res.statusCode).toBe(200);

      await mapService.handleLocationUpdate({
        type: "AssetLocationUpdated",
        org_id: "org-1",
        fleet_id: "fleet-1",
        asset_id: "asset-9",
        lat: 5,
        lng: 5,
        timestamp: new Date().toISOString(),
      });
      const positions = await app.inject({
        method: "GET",
        url: "/fleets/fleet-1/positions",
        headers: scopeHeaders("org-1", "fleet-1"),
      });
      expect(positions.json().positions[0]).toMatchObject({ id: "asset-9", icon: "truck" });
    });
  });
});
