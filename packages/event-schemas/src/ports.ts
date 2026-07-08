/**
 * Transport-agnostic event bus ports (DIP).
 *
 * This file MUST NOT import `nats`, `kafkajs`, or any other transport
 * library. Module services depend on these interfaces, not on a transport;
 * `packages/event-bus-nats` is the only package allowed to implement them
 * against a concrete transport.
 */

/** A subscription handle returned by `EventSubscriber.subscribe`. */
export interface Subscription {
  /** Stop receiving events for this subscription. */
  unsubscribe(): Promise<void>;
}

export interface EventPublisher {
  /**
   * Publish an event payload under the given subject/topic. The payload
   * should already have been validated against its zod schema by the
   * caller before this is invoked.
   */
  publish<T>(subject: string, payload: T): Promise<void>;
}

export interface EventSubscriber {
  /**
   * Subscribe to a subject/topic. The handler receives the raw decoded
   * payload — schema validation is the handler's/caller's responsibility,
   * not the transport's.
   */
  subscribe<T>(subject: string, handler: (payload: T) => Promise<void> | void): Promise<Subscription>;
}
