/**
 * Front-end mirror of services/chat's domain types (services/chat/src/types.ts).
 * Duplicated intentionally rather than imported: apps/web only talks to CHAT
 * over the gateway REST contract (fetch('/api/chat/...')), never by importing
 * services/chat's source, per CLAUDE.md's "gateway only" rule.
 */

export type SenderType = "user" | "system";

/** Pointer + metadata only — never a blob. */
export interface MediaReference {
  url: string;
  filename: string;
  mimeType: string;
  /** Size in bytes. */
  size: number;
}

export interface MissionChannel {
  id: string;
  org_id: string;
  fleet_id: string;
  mission_id: string;
  name: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  org_id: string;
  fleet_id: string;
  senderType: SenderType;
  senderId: string;
  body: string;
  assetId?: string;
  media?: MediaReference;
  createdAt: string;
}
