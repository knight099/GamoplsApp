import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import WebSocket from "ws";
import type { EventPublisher } from "@gamopls/event-schemas";
import { SCOPE_HEADER_NAME, signScopeHeader } from "@gamopls/auth";
import { buildApp } from "../build-app.js";
import { MapService } from "../map-service.js";
import { InMemoryPositionCache } from "../cache/in-memory-position-cache.js";

function noopPublisher(): EventPublisher {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

const SCOPE_SECRET = "map-ws-test-secret";
const scopeHeaders = (org_id = "org-1", fleet_id = "fleet-1") => ({
  [SCOPE_HEADER_NAME]: signScopeHeader({ org_id, fleet_id }, { secret: SCOPE_SECRET }),
});

/**
 * A queue-backed WS test client. Attaches its `message` listener the
 * instant the socket is constructed (not after awaiting `open`), so a
 * message pushed by the server immediately on connection — as this
 * service's initial-snapshot push is — can never race ahead of the
 * listener and get silently dropped. `nextMessage()` drains the queue if
 * one is already buffered, or waits for the next arrival otherwise.
 */
class QueuedWsClient {
  readonly socket: WebSocket;
  private readonly queue: Record<string, unknown>[] = [];
  private readonly waiters: Array<(msg: Record<string, unknown>) => void> = [];

  constructor(url: string, headers?: Record<string, string>) {
    this.socket = new WebSocket(url, { headers });
    this.socket.on("message", (data) => {
      const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(parsed);
      } else {
        this.queue.push(parsed);
      }
    });
  }

  waitForOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
  }

  nextMessage(): Promise<Record<string, unknown>> {
    const buffered = this.queue.shift();
    if (buffered) return Promise.resolve(buffered);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  close(): void {
    this.socket.close();
  }
}

describe("map WebSocket live positions stream", () => {
  let app: FastifyInstance;
  let mapService: MapService;
  let baseUrl: string;

  beforeEach(async () => {
    mapService = new MapService(new InMemoryPositionCache(), noopPublisher());
    app = await buildApp(mapService, { scopeSecret: SCOPE_SECRET });
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    baseUrl = address.replace("http://", "ws://");
  });

  afterEach(async () => {
    await app.close();
  });

  it("sends an initial snapshot on connect, then a push after a new location update", async () => {
    await mapService.handleLocationUpdate({
      type: "AssetLocationUpdated",
      org_id: "org-1",
      fleet_id: "fleet-1",
      asset_id: "asset-1",
      lat: 10,
      lng: 10,
      timestamp: new Date().toISOString(),
    });

    const client = new QueuedWsClient(`${baseUrl}/ws/fleets/fleet-1/positions`, scopeHeaders());
    await client.waitForOpen();

    const initial = await client.nextMessage();
    expect(initial).toMatchObject({
      fleet_id: "fleet-1",
      positions: [expect.objectContaining({ id: "asset-1", lat: 10, lng: 10 })],
    });

    await mapService.handleLocationUpdate({
      type: "AssetLocationUpdated",
      org_id: "org-1",
      fleet_id: "fleet-1",
      asset_id: "asset-1",
      lat: 20,
      lng: 20,
      timestamp: new Date().toISOString(),
    });

    const update = await client.nextMessage();
    expect(update).toMatchObject({
      fleet_id: "fleet-1",
      positions: [expect.objectContaining({ id: "asset-1", lat: 20, lng: 20 })],
    });

    client.close();
  });

  it("scopes the stream to the requested fleet — updates from another fleet are not pushed", async () => {
    const client = new QueuedWsClient(`${baseUrl}/ws/fleets/fleet-1/positions`, scopeHeaders());
    await client.waitForOpen();
    await client.nextMessage(); // initial empty snapshot

    await mapService.handleLocationUpdate({
      type: "AssetLocationUpdated",
      org_id: "org-1",
      fleet_id: "fleet-OTHER",
      asset_id: "asset-x",
      lat: 1,
      lng: 1,
      timestamp: new Date().toISOString(),
    });

    // Give the event loop a moment; no message for this fleet should arrive.
    let receivedSecond = false;
    void client.nextMessage().then(() => {
      receivedSecond = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(receivedSecond).toBe(false);

    client.close();
  });

  it("closes the socket with 1008 when the scope header is missing (S-3)", async () => {
    const ws = new WebSocket(`${baseUrl}/ws/fleets/fleet-1/positions`);
    const code = await new Promise<number>((resolve) => ws.on("close", (c) => resolve(c)));
    expect(code).toBe(1008);
  });

  it("closes the socket with 1008 when the fleet path is outside the scope (S-3)", async () => {
    const ws = new WebSocket(`${baseUrl}/ws/fleets/fleet-OTHER/positions`, {
      headers: scopeHeaders("org-1", "fleet-1"),
    });
    const code = await new Promise<number>((resolve) => ws.on("close", (c) => resolve(c)));
    expect(code).toBe(1008);
  });
});
