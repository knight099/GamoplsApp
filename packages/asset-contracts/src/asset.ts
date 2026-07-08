/**
 * Base Asset interface.
 *
 * Every Asset Type Plugin (vehicle, drone, vessel, ...) implements this.
 * Module services (map, chat, board, hub) must only ever depend on this
 * interface — and the narrow role interfaces in this package — never on a
 * concrete plugin type. See CLAUDE.md "Architecture rules that override
 * intuition".
 *
 * `getMapIcon()` / `getDisplayLabel()` exist here specifically so consuming
 * services never need `if (asset.type === 'vehicle')` branches (OCP/LSP):
 * a plugin owns how it wants to be drawn and labeled.
 */
export interface Asset {
  /** Globally unique asset id. */
  readonly id: string;

  /** Tenant scoping — every asset belongs to exactly one org and fleet. */
  readonly org_id: string;
  readonly fleet_id: string;

  /**
   * String discriminant identifying which Asset Type Plugin owns this
   * asset (e.g. "vehicle", "drone", "vessel"). Module services may use
   * this for logging/metrics, but must never branch business logic on it —
   * that behavior belongs on the plugin via the methods/interfaces below.
   */
  readonly type: string;

  /**
   * Free-form bag for plugin-owned extension data that doesn't belong in
   * the shared contract. Module services must treat this as opaque.
   */
  readonly pluginMetadata: Record<string, unknown>;

  /** Icon identifier/URL the plugin wants rendered on the map for this asset. */
  getMapIcon(): string;

  /** Human-readable label for this asset, as the plugin wants it shown. */
  getDisplayLabel(): string;
}
