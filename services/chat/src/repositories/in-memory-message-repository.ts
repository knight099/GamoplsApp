import { randomUUID } from "node:crypto";
import type { MessageRepository } from "./message-repository.js";
import type { ChatMessage, CreateMessageInput, UpdateMessageInput } from "../types.js";

/** In-memory MessageRepository — default for tests and for a Postgres-less dev/demo run. */
export class InMemoryMessageRepository implements MessageRepository {
  private readonly messages = new Map<string, ChatMessage>();

  async create(input: CreateMessageInput): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: randomUUID(),
      channelId: input.channelId,
      org_id: input.org_id,
      fleet_id: input.fleet_id,
      senderType: input.senderType,
      senderId: input.senderId,
      body: input.body,
      assetId: input.assetId,
      media: input.media,
      createdAt: new Date().toISOString(),
    };
    this.messages.set(message.id, message);
    return message;
  }

  async findById(id: string): Promise<ChatMessage | null> {
    return this.messages.get(id) ?? null;
  }

  async listByChannel(channelId: string): Promise<ChatMessage[]> {
    return Array.from(this.messages.values())
      .filter((m) => m.channelId === channelId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async update(id: string, input: UpdateMessageInput): Promise<ChatMessage | null> {
    const existing = this.messages.get(id);
    if (!existing) return null;
    const updated: ChatMessage = { ...existing, ...input };
    this.messages.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.messages.delete(id);
  }

  clear(): void {
    this.messages.clear();
  }
}
