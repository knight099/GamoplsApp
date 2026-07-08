import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { EventPublisher } from "@gamopls/event-schemas";
import { buildApp } from "../build-app.js";
import { MapService } from "../map-service.js";
import { InMemoryPositionCache } from "../cache/in-memory-position-cache.js";

function noopPublisher(): EventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

describe("map app REST routes", () => {
  let app: FastifyInstance;
  let mapService: MapService;

  beforeEach(async () => {
    mapService = new MapService(new InMemoryPositionCache(), noopPublisher());
    app = await buildApp(mapService);
  });

  describe("geofence CRUD", () => {
    it("creates then reads back a geofence", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/geofences",
        payload: {
          org_id: "org-1",
          fleet_id: "fleet-1",
          asset_id: "asset-1",
          name: "Depot",
          centerLat: 13.0827,
          centerLng: 80.2707,
          radiusMeters: 250,
        },
      });
      expect(createRes.statusCode).toBe(201);
      const created = createRes.json();
      expect(created.id).toBeTruthy();
      expect(created.name).toBe("Depot");

      const getRes = await app.inject({ method: "GET", url: `/geofences/${created.id}` });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json()).toMatchObject({ name: "Depot", radiusMeters: 250 });
    });

    it("lists geofences filtered by fleet_id", async () => {
      await app.inject({
        method: "POST",
        url: "/geofences",
        payload: {
          org_id: "org-1",
          fleet_id: "fleet-1",
          asset_id: "asset-1",
          name: "Zone A",
          centerLat: 1,
          centerLng: 1,
          radiusMeters: 100,
        },
      });
      await app.inject({
        method: "POST",
        url: "/geofences",
        payload: {
          org_id: "org-1",
          fleet_id: "fleet-2",
          asset_id: "asset-2",
          name: "Zone B",
          centerLat: 2,
          centerLng: 2,
          radiusMeters: 100,
        },
      });

      const res = await app.inject({ method: "GET", url: "/geofences?fleet_id=fleet-1" });
      const body = res.json();
      expect(body.geofences).toHaveLength(1);
      expect(body.geofences[0].name).toBe("Zone A");
    });

    it("updates a geofence", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/geofences",
        payload: {
          org_id: "org-1",
          fleet_id: "fleet-1",
          asset_id: "asset-1",
          name: "Depot",
          centerLat: 13.0827,
          centerLng: 80.2707,
          radiusMeters: 250,
        },
      });
      const { id } = createRes.json();

      const updateRes = await app.inject({
        method: "PUT",
        url: `/geofences/${id}`,
        payload: { radiusMeters: 500 },
      });
      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.json().radiusMeters).toBe(500);
    });

    it("returns 404 updating/getting/deleting a nonexistent geofence", async () => {
      const getRes = await app.inject({ method: "GET", url: "/geofences/does-not-exist" });
      expect(getRes.statusCode).toBe(404);

      const putRes = await app.inject({
        method: "PUT",
        url: "/geofences/does-not-exist",
        payload: { radiusMeters: 10 },
      });
      expect(putRes.statusCode).toBe(404);

      const deleteRes = await app.inject({ method: "DELETE", url: "/geofences/does-not-exist" });
      expect(deleteRes.statusCode).toBe(404);
    });

    it("deletes a geofence", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/geofences",
        payload: {
          org_id: "org-1",
          fleet_id: "fleet-1",
          asset_id: "asset-1",
          name: "Depot",
          centerLat: 13.0827,
          centerLng: 80.2707,
          radiusMeters: 250,
        },
      });
      const { id } = createRes.json();

      const deleteRes = await app.inject({ method: "DELETE", url: `/geofences/${id}` });
      expect(deleteRes.statusCode).toBe(204);

      const getRes = await app.inject({ method: "GET", url: `/geofences/${id}` });
      expect(getRes.statusCode).toBe(404);
    });

    it("returns 400 for an invalid geofence payload", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/geofences",
        payload: { org_id: "org-1", fleet_id: "fleet-1" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("asset metadata + positions read", () => {
    it("sets asset metadata then returns it via the fleet positions endpoint after a location update", async () => {
      const metaRes = await app.inject({
        method: "PUT",
        url: "/assets/asset-1/metadata",
        payload: {
          org_id: "org-1",
          fleet_id: "fleet-1",
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

      const res = await app.inject({ method: "GET", url: "/fleets/fleet-1/positions" });
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
      const res = await app.inject({ method: "GET", url: "/fleets/unknown-fleet/positions" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ fleet_id: "unknown-fleet", positions: [] });
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

      const res = await app.inject({ method: "GET", url: "/fleets/fleet-1/positions" });
      const body = res.json();
      expect(body.positions[0]).toMatchObject({ id: "asset-2", icon: "generic-asset-marker" });
    });
  });
});
