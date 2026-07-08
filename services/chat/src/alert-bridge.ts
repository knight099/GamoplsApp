import {
  ALERT_RAISED,
  alertRaisedSchema,
  type AlertRaised,
  type EventSubscriber,
  type Subscription,
} from "@gamopls/event-schemas";
import type { ChannelRepository } from "./repositories/channel-repository.js";
import type { MessageRepository } from "./repositories/message-repository.js";

/** Fixed sender id used for every alert-triggered system message. */
export const ALERT_BRIDGE_SENDER_ID = "system:alert-bridge";

/**
 * Bridges AlertRaised events (published by services/map or ai-engine) into
 * an auto-posted system message on the relevant mission channel.
 *
 * Simplifying assumption (no real Mission data exists yet, per PLAN.md
 * 4.2): AlertRaised carries `asset_id`, not `mission_id` or `channel_id`,
 * and chat has no join to board's Mission table (that would violate
 * CLAUDE.md's "no direct service-to-service calls for domain state").
 * So alerts map to a channel by **fleet_id**: the earliest-created channel
 * for that org_id/fleet_id is treated as the fleet's "default" mission
 * channel. If no channel exists yet for that fleet, one is auto-created
 * (named "Fleet Alerts") so an alert is never silently dropped. This is a
 * V1 placeholder — once services/board publishes a real mission_id-bearing
 * event (or AlertRaised gains an optional mission_id field), this should
 * switch to an exact mission_id lookup instead of a fleet-wide default.
 */
export class AlertBridge {
  private subscription: Subscription | null = null;

  constructor(
    private readonly subscriber: EventSubscriber,
    private readonly channels: ChannelRepository,
    private readonly messages: MessageRepository,
  ) {}

  async start(): Promise<void> {
    this.subscription = await this.subscriber.subscribe<unknown>(ALERT_RAISED, async (raw) => {
      const parsed = alertRaisedSchema.safeParse(raw);
      if (!parsed.success) {
        console.error("AlertBridge: dropped malformed AlertRaised payload", parsed.error.flatten());
        return;
      }
      await this.handleAlert(parsed.data);
    });
  }

  async stop(): Promise<void> {
    await this.subscription?.unsubscribe();
    this.subscription = null;
  }

  /** Exposed directly so tests (and any at-least-once redelivery path) can drive it without a real bus. */
  async handleAlert(alert: AlertRaised): Promise<void> {
    const channel = await this.resolveChannel(alert);
    await this.messages.create({
      channelId: channel.id,
      org_id: alert.org_id,
      fleet_id: alert.fleet_id,
      senderType: "system",
      senderId: ALERT_BRIDGE_SENDER_ID,
      body: `[${alert.severity.toUpperCase()}] ${alert.message}`,
      assetId: alert.asset_id,
    });
  }

  private async resolveChannel(alert: AlertRaised) {
    const existing = await this.channels.listByFleet(alert.org_id, alert.fleet_id);
    const [first] = existing;
    if (first) return first;

    return this.channels.create({
      org_id: alert.org_id,
      fleet_id: alert.fleet_id,
      // No real mission exists to reference yet; this is the documented
      // fleet-level fallback described above.
      mission_id: `fleet:${alert.fleet_id}`,
      name: "Fleet Alerts",
    });
  }
}
