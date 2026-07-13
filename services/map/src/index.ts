export { buildApp, registerMapRoutes } from "./build-app.js";
export { MapService } from "./map-service.js";
export type { AssetMetadataInput } from "./map-service.js";
export { PositionBroadcaster } from "./position-broadcaster.js";

export type { PositionCache } from "./cache/position-cache.js";
export { InMemoryPositionCache } from "./cache/in-memory-position-cache.js";
export { RedisPositionCache } from "./cache/redis-position-cache.js";
export { UpstashPositionCache } from "./cache/upstash-position-cache.js";

export { GeofenceStore } from "./geofence/geofence-store.js";
export { GeofenceExitDetector } from "./geofence/geofence-detector.js";
export { distanceMeters } from "./geofence/haversine.js";
export {
  geofenceBodySchema,
  geofenceUpdateSchema,
  type Geofence,
  type GeofenceInput,
  type GeofenceUpdate,
} from "./geofence/types.js";

export { AssetMarker, DEFAULT_MAP_ICON, defaultDisplayLabel } from "./marker/asset-marker.js";
export type { AssetPositionSnapshot } from "./marker/asset-marker.js";
export { renderMarker } from "./marker/render-marker.js";
export type { RenderedMarker } from "./marker/render-marker.js";
