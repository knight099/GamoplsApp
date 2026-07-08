export { buildApp, type BuildAppOptions } from "./build-app.js";
export { AlertBridge, ALERT_BRIDGE_SENDER_ID } from "./alert-bridge.js";

export type { ChannelRepository } from "./repositories/channel-repository.js";
export type { MessageRepository } from "./repositories/message-repository.js";
export { InMemoryChannelRepository } from "./repositories/in-memory-channel-repository.js";
export { InMemoryMessageRepository } from "./repositories/in-memory-message-repository.js";
export { PostgresChannelRepository } from "./repositories/postgres-channel-repository.js";
export { PostgresMessageRepository } from "./repositories/postgres-message-repository.js";

export type {
  ChatMessage,
  CreateMessageInput,
  CreateMissionChannelInput,
  MediaReference,
  MissionChannel,
  SenderType,
  UpdateMessageInput,
  UpdateMissionChannelInput,
} from "./types.js";

export {
  createChannelBodySchema,
  createMessageBodySchema,
  mediaReferenceSchema,
  updateChannelBodySchema,
  updateMessageBodySchema,
} from "./schemas.js";
