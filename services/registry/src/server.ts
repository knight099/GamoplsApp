import { buildApp } from "./build-app.js";

const app = buildApp();
const port = Number(process.env.PORT ?? 4400);
const host = process.env.HOST ?? "0.0.0.0";

app
  .listen({ port, host })
  .then(() => {
    app.log.info(`registry listening on http://${host}:${port}`);
  })
  .catch((err) => {
    console.error("registry failed to start:", err);
    process.exit(1);
  });
