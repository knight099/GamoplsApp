export { baseEventSchema } from "./common.js";
export type { BaseEvent } from "./common.js";

export {
  ASSET_LOCATION_UPDATED,
  assetLocationUpdatedSchema,
} from "./events/asset-location-updated.js";
export type { AssetLocationUpdated } from "./events/asset-location-updated.js";

export {
  ASSET_HEALTH_CHANGED,
  ASSET_HEALTH_RAW_SUBJECT,
  assetHealthChangedSchema,
} from "./events/asset-health-changed.js";
export type { AssetHealthChanged } from "./events/asset-health-changed.js";

export { ALERT_RAISED, alertRaisedSchema, alertSeveritySchema } from "./events/alert-raised.js";
export type { AlertRaised } from "./events/alert-raised.js";

export { TASK_SUGGESTED, taskSuggestedSchema } from "./events/task-suggested.js";
export type { TaskSuggested } from "./events/task-suggested.js";

export { MESSAGE_POSTED, messagePostedSchema } from "./events/message-posted.js";
export type { MessagePosted } from "./events/message-posted.js";

export type { EventPublisher, EventSubscriber, Subscription } from "./ports.js";
