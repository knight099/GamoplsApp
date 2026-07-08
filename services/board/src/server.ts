import { NatsEventBus } from "@gamopls/event-bus-nats";
import { buildApp } from "./build-app.js";
import { InMemoryBoardRepository } from "./in-memory-repository.js";
import { subscribeTaskSuggested } from "./task-suggested-handler.js";

const port = Number(process.env.PORT ?? 4302);
const host = process.env.HOST ?? "0.0.0.0";
const registryUrl = process.env.REGISTRY_URL ?? "http://localhost:4400";
const natsServers = process.env.NATS_URL ?? "nats://localhost:4222";

// V1 default: in-memory repository. Swap for `PostgresBoardRepository`
// (see postgres-repository.ts) by wiring a `pg` Pool here once a live
// Postgres is available in the target environment.
const repo = new InMemoryBoardRepository();

const app = buildApp({ repo, registryUrl });

async function main() {
  try {
    const bus = new NatsEventBus({ servers: natsServers, name: "board" });
    await bus.connect();
    await subscribeTaskSuggested(bus, repo, (task) => {
      app.log.info(`board: created draft task ${task.id} from TaskSuggested`);
    });
    app.log.info(`board: subscribed to TaskSuggested via NATS at ${natsServers}`);
  } catch (err) {
    app.log.warn(`board: could not connect to NATS at ${natsServers}, TaskSuggested subscription disabled: ${err}`);
  }

  await app
    .listen({ port, host })
    .then(() => {
      app.log.info(`board listening on http://${host}:${port}`);
    })
    .catch((err) => {
      console.error("board failed to start:", err);
      process.exit(1);
    });
}

main();
