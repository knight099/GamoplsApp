import { connect, JSONCodec, type NatsConnection } from "nats";
import type { EventPublisher, EventSubscriber, Subscription } from "@gamopls/event-schemas";

const codec = JSONCodec();

export interface NatsEventBusOptions {
  /** e.g. "nats://localhost:4222" */
  servers: string | string[];
  name?: string;
}

/**
 * The one concrete adapter in the repo implementing EventPublisher/
 * EventSubscriber against NATS. Module services should depend on the
 * `EventPublisher`/`EventSubscriber` interfaces from
 * `@gamopls/event-schemas`, and only reach for this class at their
 * composition root (where the concrete transport is wired up).
 */
export class NatsEventBus implements EventPublisher, EventSubscriber {
  private connection: NatsConnection | null = null;

  constructor(private readonly options: NatsEventBusOptions) {}

  async connect(): Promise<void> {
    if (this.connection) return;
    this.connection = await connect({
      servers: this.options.servers,
      name: this.options.name,
    });
  }

  async close(): Promise<void> {
    if (!this.connection) return;
    await this.connection.drain();
    this.connection = null;
  }

  private requireConnection(): NatsConnection {
    if (!this.connection) {
      throw new Error("NatsEventBus is not connected. Call connect() first.");
    }
    return this.connection;
  }

  async publish<T>(subject: string, payload: T): Promise<void> {
    const nc = this.requireConnection();
    nc.publish(subject, codec.encode(payload));
  }

  async subscribe<T>(
    subject: string,
    handler: (payload: T) => Promise<void> | void,
  ): Promise<Subscription> {
    const nc = this.requireConnection();
    const sub = nc.subscribe(subject);

    (async () => {
      for await (const msg of sub) {
        const payload = codec.decode(msg.data) as T;
        await handler(payload);
      }
    })().catch((err) => {
      // Subscription iteration ending unexpectedly (e.g. connection drop)
      // should not crash the process silently swallow it — log for now.
      // Consumers can re-subscribe via a fresh call if needed.
      console.error(`NatsEventBus subscription to "${subject}" ended with error:`, err);
    });

    return {
      unsubscribe: async () => {
        sub.unsubscribe();
      },
    };
  }
}
