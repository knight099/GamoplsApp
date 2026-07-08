import type { PrismaClient } from "@gamopls/db";
import type { MessageRepository } from "./message-repository.js";
import type { ChatMessage, CreateMessageInput, UpdateMessageInput } from "../types.js";

export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private mapMessage(dbMsg: any): ChatMessage {
    const message: ChatMessage = {
      id: dbMsg.id,
      channelId: dbMsg.channel_id,
      org_id: dbMsg.org_id,
      fleet_id: dbMsg.fleet_id,
      senderType: dbMsg.sender_type as ChatMessage["senderType"],
      senderId: dbMsg.sender_id,
      body: dbMsg.body,
      createdAt: dbMsg.created_at.toISOString(),
    };

    if (dbMsg.asset_id) {
      message.assetId = dbMsg.asset_id;
    }

    if (
      dbMsg.media_url &&
      dbMsg.media_filename &&
      dbMsg.media_mime_type &&
      dbMsg.media_size !== null &&
      dbMsg.media_size !== undefined
    ) {
      message.media = {
        url: dbMsg.media_url,
        filename: dbMsg.media_filename,
        mimeType: dbMsg.media_mime_type,
        size: Number(dbMsg.media_size),
      };
    }

    return message;
  }

  async create(input: CreateMessageInput): Promise<ChatMessage> {
    const dbMsg = await this.prisma.chatMessage.create({
      data: {
        channel_id: input.channelId,
        org_id: input.org_id,
        fleet_id: input.fleet_id,
        sender_type: input.senderType,
        sender_id: input.senderId,
        body: input.body,
        asset_id: input.assetId ?? null,
        media_url: input.media?.url ?? null,
        media_filename: input.media?.filename ?? null,
        media_mime_type: input.media?.mimeType ?? null,
        media_size: input.media?.size !== undefined ? BigInt(input.media.size) : null,
      },
    });
    return this.mapMessage(dbMsg);
  }

  async findById(id: string): Promise<ChatMessage | null> {
    try {
      const dbMsg = await this.prisma.chatMessage.findUnique({
        where: { id },
      });
      return dbMsg ? this.mapMessage(dbMsg) : null;
    } catch {
      return null;
    }
  }

  async listByChannel(channelId: string): Promise<ChatMessage[]> {
    const dbMsgs = await this.prisma.chatMessage.findMany({
      where: { channel_id: channelId },
      orderBy: { created_at: "asc" },
    });
    return dbMsgs.map((m) => this.mapMessage(m));
  }

  async update(id: string, input: UpdateMessageInput): Promise<ChatMessage | null> {
    try {
      const dbMsg = await this.prisma.chatMessage.update({
        where: { id },
        data: {
          body: input.body !== undefined ? input.body : undefined,
        },
      });
      return this.mapMessage(dbMsg);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.chatMessage.delete({
        where: { id },
      });
      return true;
    } catch {
      return false;
    }
  }
}
