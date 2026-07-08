import type { Pool } from "pg";
import type { MessageRepository } from "./message-repository.js";
import type { ChatMessage, CreateMessageInput, UpdateMessageInput } from "../types.js";

interface MessageRow {
  id: string;
  channel_id: string;
  org_id: string;
  fleet_id: string;
  sender_type: "user" | "system";
  sender_id: string;
  body: string;
  asset_id: string | null;
  media_url: string | null;
  media_filename: string | null;
  media_mime_type: string | null;
  media_size: string | null;
  created_at: string;
}

function requireRow<T>(row: T | undefined, context: string): T {
  if (!row) throw new Error(`${context}: expected a row to be returned`);
  return row;
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    channelId: row.channel_id,
    org_id: row.org_id,
    fleet_id: row.fleet_id,
    senderType: row.sender_type,
    senderId: row.sender_id,
    body: row.body,
    assetId: row.asset_id ?? undefined,
    media:
      row.media_url && row.media_filename && row.media_mime_type && row.media_size !== null
        ? {
            url: row.media_url,
            filename: row.media_filename,
            mimeType: row.media_mime_type,
            size: Number(row.media_size),
          }
        : undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const SELECT_COLUMNS =
  "id, channel_id, org_id, fleet_id, sender_type, sender_id, body, asset_id, media_url, media_filename, media_mime_type, media_size, created_at";

/**
 * Postgres-backed MessageRepository, plain SQL via `pg`. Media is stored as
 * a pointer + metadata columns only, never a blob (CLAUDE.md rule).
 */
export class PostgresMessageRepository implements MessageRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateMessageInput): Promise<ChatMessage> {
    const result = await this.pool.query<MessageRow>(
      `INSERT INTO chat_messages
         (channel_id, org_id, fleet_id, sender_type, sender_id, body, asset_id, media_url, media_filename, media_mime_type, media_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.channelId,
        input.org_id,
        input.fleet_id,
        input.senderType,
        input.senderId,
        input.body,
        input.assetId ?? null,
        input.media?.url ?? null,
        input.media?.filename ?? null,
        input.media?.mimeType ?? null,
        input.media?.size ?? null,
      ],
    );
    return toMessage(requireRow(result.rows[0], "PostgresMessageRepository.create"));
  }

  async findById(id: string): Promise<ChatMessage | null> {
    const result = await this.pool.query<MessageRow>(
      `SELECT ${SELECT_COLUMNS} FROM chat_messages WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? toMessage(result.rows[0]) : null;
  }

  async listByChannel(channelId: string): Promise<ChatMessage[]> {
    const result = await this.pool.query<MessageRow>(
      `SELECT ${SELECT_COLUMNS} FROM chat_messages WHERE channel_id = $1 ORDER BY created_at ASC`,
      [channelId],
    );
    return result.rows.map(toMessage);
  }

  async update(id: string, input: UpdateMessageInput): Promise<ChatMessage | null> {
    if (input.body === undefined) return this.findById(id);
    const result = await this.pool.query<MessageRow>(
      `UPDATE chat_messages SET body = $2 WHERE id = $1 RETURNING ${SELECT_COLUMNS}`,
      [id, input.body],
    );
    return result.rows[0] ? toMessage(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM chat_messages WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
