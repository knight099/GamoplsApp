import { MqttTelemetryPreviewPublisher } from "./src/telemetry-preview-publisher.js";

const publisher = new MqttTelemetryPreviewPublisher({
  brokerUrl: "tcp://localhost:1883",
  username: "edgebox",
  password: "changeme-dev-only",
});

console.log("calling publish()...");
const start = Date.now();
try {
  await publisher.publish({ assetId: "direct-test-asset", orgId: "direct-test-org", fleetId: "direct-test-fleet" });
  console.log(`publish() resolved successfully in ${Date.now() - start}ms`);
} catch (err) {
  console.error(`publish() rejected after ${Date.now() - start}ms:`, err);
}
process.exit(0);
