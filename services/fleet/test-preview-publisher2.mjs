import { MqttTelemetryPreviewPublisher } from "./src/telemetry-preview-publisher.js";
const publisher = new MqttTelemetryPreviewPublisher({ brokerUrl: "tcp://localhost:1883", username: "edgebox", password: "changeme-dev-only" });
await publisher.publish({ assetId: "watched-test-asset", orgId: "watched-org", fleetId: "watched-fleet" });
console.log("done");
process.exit(0);
