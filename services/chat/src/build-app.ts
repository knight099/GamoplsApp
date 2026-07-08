import Fastify, { type FastifyInstance } from "fastify";
import type { ChannelRepository } from "./repositories/channel-repository.js";
import type { MessageRepository } from "./repositories/message-repository.js";
import { InMemoryChannelRepository } from "./repositories/in-memory-channel-repository.js";
import { InMemoryMessageRepository } from "./repositories/in-memory-message-repository.js";
import {
  createChannelBodySchema,
  createMessageBodySchema,
  updateChannelBodySchema,
  updateMessageBodySchema,
} from "./schemas.js";

export interface BuildAppOptions {
  channels?: ChannelRepository;
  messages?: MessageRepository;
}

/**
 * Builds (but does not start listening) the Fastify app for CHAT. Kept
 * separate from server.ts so tests can use Fastify's `inject()` without
 * binding a real port, mirroring services/registry's convention.
 *
 * Repositories default to the in-memory implementation so this app is
 * runnable/testable with zero external dependencies; pass Postgres-backed
 * repositories at the composition root (server.ts) for a real deployment.
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const channels = options.channels ?? new InMemoryChannelRepository();
  const messages = options.messages ?? new InMemoryMessageRepository();

  // ---- Mission channel CRUD ----

  app.post("/channels", async (request, reply) => {
    const parsed = createChannelBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid channel payload", details: parsed.error.flatten() });
    }
    const channel = await channels.create(parsed.data);
    return reply.status(201).send(channel);
  });

  app.get("/channels", async (request, reply) => {
    const orgId = (request.query as { org_id?: string }).org_id;
    if (!orgId) {
      return reply.status(400).send({ error: "org_id query param is required" });
    }
    const missionId = (request.query as { mission_id?: string }).mission_id;
    const result = missionId
      ? await channels.listByMission(orgId, missionId)
      : await channels.list(orgId);
    return reply.status(200).send({ channels: result });
  });

  app.get("/channels/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const channel = await channels.findById(id);
    if (!channel) return reply.status(404).send({ error: "channel not found" });
    return reply.status(200).send(channel);
  });

  app.patch("/channels/:id", async (request, reply) => {
    const parsed = updateChannelBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid channel update payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const updated = await channels.update(id, parsed.data);
    if (!updated) return reply.status(404).send({ error: "channel not found" });
    return reply.status(200).send(updated);
  });

  app.delete("/channels/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await channels.delete(id);
    if (!deleted) return reply.status(404).send({ error: "channel not found" });
    return reply.status(204).send();
  });

  // ---- Message CRUD (scoped to a channel) ----

  app.post("/channels/:channelId/messages", async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    const channel = await channels.findById(channelId);
    if (!channel) return reply.status(404).send({ error: "channel not found" });

    const parsed = createMessageBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid message payload", details: parsed.error.flatten() });
    }
    // org_id/fleet_id are threaded from the channel (source of truth for
    // tenancy scoping), not trusted from the request body.
    const message = await messages.create({
      channelId,
      org_id: channel.org_id,
      fleet_id: channel.fleet_id,
      ...parsed.data,
    });
    return reply.status(201).send(message);
  });

  app.get("/channels/:channelId/messages", async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    const channel = await channels.findById(channelId);
    if (!channel) return reply.status(404).send({ error: "channel not found" });
    const result = await messages.listByChannel(channelId);
    return reply.status(200).send({ messages: result });
  });

  app.get("/messages/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const message = await messages.findById(id);
    if (!message) return reply.status(404).send({ error: "message not found" });
    return reply.status(200).send(message);
  });

  app.patch("/messages/:id", async (request, reply) => {
    const parsed = updateMessageBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid message update payload", details: parsed.error.flatten() });
    }
    const { id } = request.params as { id: string };
    const updated = await messages.update(id, parsed.data);
    if (!updated) return reply.status(404).send({ error: "message not found" });
    return reply.status(200).send(updated);
  });

  app.delete("/messages/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await messages.delete(id);
    if (!deleted) return reply.status(404).send({ error: "message not found" });
    return reply.status(204).send();
  });

  return app;
}
