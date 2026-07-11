import type { ChatMessage, MissionChannel } from "./types";

/**
 * Thin client-side fetch wrappers for the CHAT gateway routes
 * (apps/web/app/api/chat/[...path]/route.ts -> services/chat).
 *
 * These ONLY call `/api/chat/...` (never services/chat directly), per
 * CLAUDE.md's API-gateway rule and the contract documented in
 * apps/web/lib/gateway-proxy.ts. Tenant scope is attached by the gateway
 * as a signed internal header derived from the session JWT — request
 * bodies never carry org_id/fleet_id.
 */

async function readJsonOrThrow<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const message = typeof body.error === "string" ? body.error : fallbackMessage;
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function fetchChannels(): Promise<MissionChannel[]> {
  const res = await fetch("/api/chat/channels");
  const data = await readJsonOrThrow<{ channels: MissionChannel[] }>(res, "Failed to load channels");
  return data.channels;
}

export interface CreateChannelInput {
  mission_id: string;
  name: string;
}

export async function createChannel(input: CreateChannelInput): Promise<MissionChannel> {
  const res = await fetch("/api/chat/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readJsonOrThrow<MissionChannel>(res, "Failed to create channel");
}

export async function fetchMessages(channelId: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/chat/channels/${encodeURIComponent(channelId)}/messages`);
  const data = await readJsonOrThrow<{ messages: ChatMessage[] }>(res, "Failed to load messages");
  return data.messages;
}

export interface PostMessageInput {
  senderId: string;
  body: string;
}

export async function postMessage(channelId: string, input: PostMessageInput): Promise<ChatMessage> {
  const res = await fetch(`/api/chat/channels/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ senderType: "user", ...input }),
  });
  return readJsonOrThrow<ChatMessage>(res, "Failed to send message");
}
