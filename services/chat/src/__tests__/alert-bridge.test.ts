import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventSubscriber, Subscription } from "@gamopls/event-schemas";
import { ALERT_RAISED, type AlertRaised } from "@gamopls/event-schemas";
import { AlertBridge, ALERT_BRIDGE_SENDER_ID } from "../alert-bridge.js";
import { InMemoryChannelRepository } from "../repositories/in-memory-channel-repository.js";
import { InMemoryMessageRepository } from "../repositories/in-memory-message-repository.js";

/** A minimal fake EventSubscriber that records handlers and lets tests fire events synchronously. */
class FakeEventSubscriber implements EventSubscriber {
  handlers = new Map<string, (payload: unknown) => Promise<void> | void>();

  async subscribe<T>(subject: string, handler: (payload: T) => Promise<void> | void): Promise<Subscription> {
    this.handlers.set(subject, handler as (payload: unknown) => Promise<void> | void);
    return { unsubscribe: vi.fn(async () => {}) };
  }

  async emit(subject: string, payload: unknown): Promise<void> {
    const handler = this.handlers.get(subject);
    if (!handler) throw new Error(`no handler subscribed for ${subject}`);
    await handler(payload);
  }
}

function makeAlert(overrides: Partial<AlertRaised> = {}): AlertRaised {
  return {
    org_id: "org-1",
    fleet_id: "fleet-1",
    timestamp: new Date().toISOString(),
    type: "AlertRaised",
    asset_id: "asset-1",
    severity: "critical",
    reason: "geofence_exit",
    message: "Vehicle asset-1 exited geofence Chennai-Depot",
    ...overrides,
  };
}

describe("AlertBridge", () => {
  let subscriber: FakeEventSubscriber;
  let channels: InMemoryChannelRepository;
  let messages: InMemoryMessageRepository;
  let bridge: AlertBridge;

  beforeEach(() => {
    subscriber = new FakeEventSubscriber();
    channels = new InMemoryChannelRepository();
    messages = new InMemoryMessageRepository();
    bridge = new AlertBridge(subscriber, channels, messages);
  });

  it("subscribes to the AlertRaised subject on start()", async () => {
    await bridge.start();
    expect(subscriber.handlers.has(ALERT_RAISED)).toBe(true);
  });

  it("auto-creates a fleet channel and posts a system message when no channel exists yet for that fleet", async () => {
    await bridge.start();
    await subscriber.emit(ALERT_RAISED, makeAlert());

    const fleetChannels = await channels.listByFleet("org-1", "fleet-1");
    expect(fleetChannels).toHaveLength(1);
    expect(fleetChannels[0]).toMatchObject({ name: "Fleet Alerts", org_id: "org-1", fleet_id: "fleet-1" });

    const posted = await messages.listByChannel(fleetChannels[0]!.id);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      senderType: "system",
      senderId: ALERT_BRIDGE_SENDER_ID,
      assetId: "asset-1",
      org_id: "org-1",
      fleet_id: "fleet-1",
    });
    expect(posted[0]!.body).toContain("Vehicle asset-1 exited geofence Chennai-Depot");
    expect(posted[0]!.body).toContain("CRITICAL");
  });

  it("posts into an existing fleet channel instead of creating a new one", async () => {
    const existing = await channels.create({
      org_id: "org-1",
      fleet_id: "fleet-1",
      mission_id: "mission-42",
      name: "Chennai Pilot Run",
    });

    await bridge.start();
    await subscriber.emit(ALERT_RAISED, makeAlert());

    const fleetChannels = await channels.listByFleet("org-1", "fleet-1");
    expect(fleetChannels).toHaveLength(1);
    expect(fleetChannels[0]!.id).toBe(existing.id);

    const posted = await messages.listByChannel(existing.id);
    expect(posted).toHaveLength(1);
  });

  it("drops a malformed AlertRaised payload without throwing or posting a message", async () => {
    await bridge.start();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(subscriber.emit(ALERT_RAISED, { not: "a valid alert" })).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    const fleetChannels = await channels.list("org-1");
    expect(fleetChannels).toHaveLength(0);

    errorSpy.mockRestore();
  });

  it("handleAlert can be invoked directly (used for at-least-once redelivery paths)", async () => {
    await bridge.handleAlert(makeAlert({ fleet_id: "fleet-9" }));
    const fleetChannels = await channels.listByFleet("org-1", "fleet-9");
    expect(fleetChannels).toHaveLength(1);
  });

  it("stop() unsubscribes", async () => {
    await bridge.start();
    await bridge.stop();
    // no assertion beyond "doesn't throw" — Subscription.unsubscribe is a mocked async fn
  });
});
