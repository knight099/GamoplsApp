import { Pool } from "pg";
import { NatsEventBus } from "@gamopls/event-bus-nats";
import { buildApp } from "./build-app.js";
import { AlertBridge } from "./alert-bridge.js";
import { InMemoryChannelRepository } from "./repositories/in-memory-channel-repository.js";
import { InMemoryMessageRepository } from "./repositories/in-memory-message-repository.js";
import { PostgresChannelRepository } from "./repositories/postgres-channel-repository.js";
import { PostgresMessageRepository } from "./repositories/postgres-message-repository.js";
import type { ChannelRepository } from "./repositories/channel-repository.js";
import type { MessageRepository } from "./repositories/message-repository.js";

const port = Number(process.env.PORT ?? 4300);
const host = process.env.HOST ?? "0.0.0.0";
const databaseUrl = process.env.DATABASE_URL;
const natsServers = process.env.NATS_SERVERS ?? "nats://localhost:4222";

let channels: ChannelRepository;
let messages: MessageRepository;

if (databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl });
  channels = new PostgresChannelRepository(pool);
  messages = new PostgresMessageRepository(pool);
} else {
  console.warn("DATABASE_URL not set — chat is running with an in-memory (non-persistent) store.");
  channels = new InMemoryChannelRepository();
  messages = new InMemoryMessageRepository();
}

const app = buildApp({ channels, messages });

const eventBus = new NatsEventBus({ servers: natsServers, name: "gamopls-chat" });
const alertBridge = new AlertBridge(eventBus, channels, messages);

async function main() {
  try {
    await eventBus.connect();
    await alertBridge.start();
    app.log.info(`chat connected to NATS at ${natsServers} and subscribed to AlertRaised`);
  } catch (err) {
    console.error("chat: failed to connect to NATS, continuing without the AlertRaised bridge:", err);
  }

  await app.listen({ port, host });
  app.log.info(`chat listening on http://${host}:${port}`);
}

main().catch((err) => {
  console.error("chat failed to start:", err);
  process.exit(1);
});
