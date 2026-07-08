import { describe, expect, it, vi } from "vitest";
import type { EventPublisher } from "@gamopls/event-schemas";
import { GeofenceStore } from "../geofence/geofence-store.js";
import { GeofenceExitDetector } from "../geofence/geofence-detector.js";
import type { AssetLocationUpdated } from "@gamopls/event-schemas";

function locationUpdate(overrides: Partial<AssetLocationUpdated> = {}): AssetLocationUpdated {
  return {
    type: "AssetLocationUpdated",
    org_id: "org-1",
    fleet_id: "fleet-1",
    asset_id: "asset-1",
    lat: 13.0827,
    lng: 80.2707,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function mockPublisher(): EventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

describe("GeofenceExitDetector", () => {
  it("does not publish on the first observed position (baseline seed, even if outside)", async () => {
    const store = new GeofenceStore();
    store.create({
      org_id: "org-1",
      fleet_id: "fleet-1",
      asset_id: "asset-1",
      name: "Zone A",
      centerLat: 13.0827,
      centerLng: 80.2707,
      radiusMeters: 100,
    });
    const publisher = mockPublisher();
    const detector = new GeofenceExitDetector(store, publisher);

    // Far outside the geofence, but it's the first-ever observation.
    await detector.checkPosition(locationUpdate({ lat: 20.0, lng: 80.0 }));

    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it("publishes AlertRaised when a position update crosses from inside to outside", async () => {
    const store = new GeofenceStore();
    const geofence = store.create({
      org_id: "org-1",
      fleet_id: "fleet-1",
      asset_id: "asset-1",
      name: "Zone A",
      centerLat: 13.0827,
      centerLng: 80.2707,
      radiusMeters: 100,
    });
    const publisher = mockPublisher();
    const detector = new GeofenceExitDetector(store, publisher);

    // Inside first.
    await detector.checkPosition(locationUpdate({ lat: 13.0827, lng: 80.2707 }));
    expect(publisher.publish).not.toHaveBeenCalled();

    // Now well outside (roughly 11km away).
    await detector.checkPosition(locationUpdate({ lat: 13.18, lng: 80.2707 }));

    expect(publisher.publish).toHaveBeenCalledTimes(1);
    const call = (publisher.publish as ReturnType<typeof vi.fn>).mock.calls[0];
    if (!call) throw new Error("expected publish to have been called");
    const [subject, payload] = call;
    expect(subject).toBe("AlertRaised");
    expect(payload).toMatchObject({
      type: "AlertRaised",
      org_id: "org-1",
      fleet_id: "fleet-1",
      asset_id: "asset-1",
      severity: "warning",
      reason: "geofence_exit",
    });
    expect((payload as { message: string }).message).toContain(geofence.name);
  });

  it("does not re-publish on subsequent outside updates (fires once per exit)", async () => {
    const store = new GeofenceStore();
    store.create({
      org_id: "org-1",
      fleet_id: "fleet-1",
      asset_id: "asset-1",
      name: "Zone A",
      centerLat: 13.0827,
      centerLng: 80.2707,
      radiusMeters: 100,
    });
    const publisher = mockPublisher();
    const detector = new GeofenceExitDetector(store, publisher);

    await detector.checkPosition(locationUpdate({ lat: 13.0827, lng: 80.2707 })); // inside
    await detector.checkPosition(locationUpdate({ lat: 13.18, lng: 80.2707 })); // exit #1
    await detector.checkPosition(locationUpdate({ lat: 13.2, lng: 80.2707 })); // still outside

    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });

  it("re-fires on a second distinct exit after re-entering", async () => {
    const store = new GeofenceStore();
    store.create({
      org_id: "org-1",
      fleet_id: "fleet-1",
      asset_id: "asset-1",
      name: "Zone A",
      centerLat: 13.0827,
      centerLng: 80.2707,
      radiusMeters: 100,
    });
    const publisher = mockPublisher();
    const detector = new GeofenceExitDetector(store, publisher);

    await detector.checkPosition(locationUpdate({ lat: 13.0827, lng: 80.2707 })); // inside
    await detector.checkPosition(locationUpdate({ lat: 13.18, lng: 80.2707 })); // exit #1
    await detector.checkPosition(locationUpdate({ lat: 13.0827, lng: 80.2707 })); // re-enter
    await detector.checkPosition(locationUpdate({ lat: 13.18, lng: 80.2707 })); // exit #2

    expect(publisher.publish).toHaveBeenCalledTimes(2);
  });

  it("ignores geofences not assigned to the updating asset", async () => {
    const store = new GeofenceStore();
    store.create({
      org_id: "org-1",
      fleet_id: "fleet-1",
      asset_id: "asset-other",
      name: "Zone B",
      centerLat: 13.0827,
      centerLng: 80.2707,
      radiusMeters: 100,
    });
    const publisher = mockPublisher();
    const detector = new GeofenceExitDetector(store, publisher);

    await detector.checkPosition(locationUpdate({ asset_id: "asset-1", lat: 13.0827, lng: 80.2707 }));
    await detector.checkPosition(locationUpdate({ asset_id: "asset-1", lat: 20.0, lng: 80.0 }));

    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
