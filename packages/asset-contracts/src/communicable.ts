/**
 * Role interface for assets bound to a mission communication channel
 * (owned by services/chat). Only a channel id reference lives here — the
 * channel/message data itself belongs entirely to services/chat.
 */
export interface Communicable {
  /** id of the mission channel (services/chat) this asset is bound to, if any. */
  missionChannelId: string | null;
}
