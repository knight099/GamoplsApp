import { EventEmitter } from "node:events";
import type { RenderedMarker } from "./marker/render-marker.js";

/**
 * In-process pub/sub used to push live position updates to open WebSocket
 * connections, scoped by fleet_id. This is intentionally separate from
 * the NATS event bus (which is for cross-service events) and from the
 * position cache (which is the durable/queryable store) — it only exists
 * to fan a cache update out to whichever WS clients are currently
 * connected for that fleet.
 */
export class PositionBroadcaster {
  private readonly emitter = new EventEmitter();

  private topic(fleetId: string): string {
    return `fleet:${fleetId}`;
  }

  publish(fleetId: string, markers: RenderedMarker[]): void {
    this.emitter.emit(this.topic(fleetId), markers);
  }

  subscribe(fleetId: string, handler: (markers: RenderedMarker[]) => void): () => void {
    const topic = this.topic(fleetId);
    this.emitter.on(topic, handler);
    return () => this.emitter.off(topic, handler);
  }
}
