export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertThreshold {
  metric: string;
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  value: number;
  severity: AlertSeverity;
}

/**
 * Role interface for assets that can raise alerts based on threshold
 * breaches on their own telemetry/state.
 */
export interface Alertable {
  alertThresholds: AlertThreshold[];
  /** Whether this asset currently has an unresolved active alert. */
  hasActiveAlert: boolean;
}
