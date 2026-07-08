/**
 * Role interface for assets that report a physical position.
 * Independently importable per ISP — a plugin only implements this if the
 * asset actually has a location (a static document asset, for example,
 * would not).
 */
export interface Locatable {
  lat: number;
  lng: number;
  /** Compass heading in degrees, 0-360. Optional — not every asset moves directionally. */
  heading?: number;
  /** Speed in meters/second. Optional. */
  speed?: number;
  /** ISO 8601 timestamp of when this position was last observed. */
  positionUpdatedAt: string;
}
