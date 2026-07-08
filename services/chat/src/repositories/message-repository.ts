import type { ChatMessage, CreateMessageInput, UpdateMessageInput } from "../types.js";

/** Persistence port for messages — same swappable-repository pattern as ChannelRepository. */
export interface MessageRepository {
  create(input: CreateMessageInput): Promise<ChatMessage>;
  findById(id: string): Promise<ChatMessage | null>;
  listByChannel(channelId: string): Promise<ChatMessage[]>;
  update(id: string, input: UpdateMessageInput): Promise<ChatMessage | null>;
  delete(id: string): Promise<boolean>;
}
