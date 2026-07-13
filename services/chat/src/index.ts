export { buildApp, registerChatRoutes, type BuildAppOptions } from "./build-app.js";
export { AlertBridge, ALERT_BRIDGE_SENDER_ID } from "./alert-bridge.js";

export type { ChannelRepository } from "./repositories/channel-repository.js";
export type { MessageRepository } from "./repositories/message-repository.js";
export { InMemoryChannelRepository } from "./repositories/in-memory-channel-repository.js";
export { InMemoryMessageRepository } from "./repositories/in-memory-message-repository.js";
export { PrismaChannelRepository } from "./repositories/prisma-channel-repository.js";
export { PrismaMessageRepository } from "./repositories/prisma-message-repository.js";

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
