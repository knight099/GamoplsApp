/**
 * Domain types for the CHAT module service.
 *
 * A "channel" belongs to a `mission_id` — chat treats this purely as an
 * opaque string reference. It never fetches or validates the mission
 * itself; that's services/board's concern (CLAUDE.md: cross-module
 * communication only via the event bus / mission_id references, never a
 * direct call into services/board).
 */

export type SenderType = "user" | "system";

/** Pointer + metadata only — CLAUDE.md forbids storing a media blob here. */
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

export interface CreateMissionChannelInput {
  org_id: string;
  fleet_id: string;
  mission_id: string;
  name: string;
}

export interface UpdateMissionChannelInput {
  name?: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  org_id: string;
  fleet_id: string;
  senderType: SenderType;
  /** User id for senderType "user"; a fixed system identifier for "system" (e.g. "system:alert-bridge"). */
  senderId: string;
  body: string;
  /** Present when the message is about/attached to a specific asset (mirrors event-schemas' MessagePosted.asset_id). */
  assetId?: string;
  media?: MediaReference;
  createdAt: string;
}

export interface CreateMessageInput {
  channelId: string;
  org_id: string;
  fleet_id: string;
  senderType: SenderType;
  senderId: string;
  body: string;
  assetId?: string;
  media?: MediaReference;
}

export interface UpdateMessageInput {
  body?: string;
}
