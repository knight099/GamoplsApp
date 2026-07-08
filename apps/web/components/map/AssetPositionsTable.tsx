import { Badge, DataTable } from "@gamopls/ui";
import type { AssetMarker } from "./types";

export interface AssetPositionsTableProps {
  positions: AssetMarker[];
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

/**
 * V1 simplification: renders asset positions as a plain list/table
 * ("asset X at lat/lng, icon: Y, last updated: Z") rather than an
 * interactive map. Wiring up a real map (Leaflet/Mapbox) needs an
 * external tile provider/API key and is out of scope here — see the
 * report for the tradeoff. Icon/label are rendered verbatim as text,
 * exactly as `services/map` computed them server-side (via
 * `asset.getMapIcon()`/`getDisplayLabel()`) — this component never
 * inspects asset type.
 */
export function AssetPositionsTable({ positions }: AssetPositionsTableProps) {
  return (
    <DataTable
      columns={[
        {
          key: "icon",
          header: "Icon",
          render: (row: AssetMarker) => <Badge tone="info">{row.icon}</Badge>,
        },
        {
          key: "label",
          header: "Asset",
          render: (row: AssetMarker) => row.label,
        },
        {
          key: "position",
          header: "Position",
          render: (row: AssetMarker) => `${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}`,
        },
        {
          key: "heading",
          header: "Heading",
          render: (row: AssetMarker) => (row.heading !== undefined ? `${row.heading}°` : "—"),
        },
        {
          key: "speed",
          header: "Speed",
          render: (row: AssetMarker) => (row.speed !== undefined ? `${row.speed}` : "—"),
        },
        {
          key: "updated",
          header: "Last updated",
          render: (row: AssetMarker) => formatTimestamp(row.positionUpdatedAt),
        },
      ]}
      rows={positions}
      getRowKey={(row) => row.id}
      emptyState="No assets reporting a position for this fleet yet."
    />
  );
}
