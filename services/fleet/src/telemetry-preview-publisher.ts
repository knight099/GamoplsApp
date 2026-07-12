import mqtt from "mqtt";

/**
 * "Preview with live data" (suggestions.md S-5 / roadmap item 8): publishes
 * one real MQTT message matching infra/simulators/edgebox-sim's exact
 * payload shape, authenticated as the `edgebox` broker device user set up
 * in the tenancy-hardening session (S-2). This flows through the same
 * ingestion -> ai-engine -> fleet/map/board pipeline a real Edge Box uses —
 * never a database-only fake — so a newly added vehicle with no hardware
 * yet can still prove the pipeline works within a few seconds.
 */
export interface PreviewReading {
  assetId: string;
  orgId: string;
  fleetId: string;
}

export interface TelemetryPreviewPublisher {
  publish(reading: PreviewReading): Promise<void>;
}

export interface MqttTelemetryPreviewPublisherOptions {
  brokerUrl: string;
  username: string;
  password: string;
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class MqttTelemetryPreviewPublisher implements TelemetryPreviewPublisher {
  constructor(private readonly options: MqttTelemetryPreviewPublisherOptions) {}

  async publish(reading: PreviewReading): Promise<void> {
    const client = mqtt.connect(this.options.brokerUrl, {
      username: this.options.username,
      password: this.options.password,
      clientId: `preview-${reading.assetId}-${Date.now()}`,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("error", (err) => reject(err));
      });

      const topic = `edgebox/${reading.orgId}/${reading.fleetId}/preview-${reading.assetId}/telemetry`;
      const payload = {
        device_id: `preview-${reading.assetId}`,
        asset_id: reading.assetId,
        org_id: reading.orgId,
        fleet_id: reading.fleetId,
        ts: new Date().toISOString(),
        gps: {
          lat: 13.0827 + randomInRange(-0.025, 0.025),
          lng: 80.2707 + randomInRange(-0.025, 0.025),
          heading: randomInRange(0, 360),
          speed_kmh: randomInRange(20, 50),
        },
        telemetry: {
          battery_pct: randomInRange(70, 95),
          engine_temp_c: randomInRange(75, 90),
          fuel_pct: randomInRange(50, 90),
          health_score: randomInRange(85, 95),
        },
      };

      await new Promise<void>((resolve, reject) => {
        client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => (err ? reject(err) : resolve()));
      });
    } finally {
      client.end();
    }
  }
}
