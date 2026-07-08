import { Spinner } from "@gamopls/ui";
import type { MissionChannel } from "./types";

export interface ChannelListProps {
  channels: MissionChannel[];
  selectedChannelId: string | null;
  onSelect: (channelId: string) => void;
  loading: boolean;
  error: string | null;
}

/** Sidebar list of mission channels. */
export function ChannelList({ channels, selectedChannelId, onSelect, loading, error }: ChannelListProps) {
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem" }}>
        <Spinner size={14} /> <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>Loading channels…</span>
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" style={{ color: "#dc2626", fontSize: "0.875rem", padding: "0.75rem" }}>
        {error}
      </p>
    );
  }

  if (channels.length === 0) {
    return (
      <p style={{ color: "#6b7280", fontSize: "0.875rem", padding: "0.75rem" }}>
        No mission channels yet — create one below.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {channels.map((channel) => {
        const isSelected = channel.id === selectedChannelId;
        return (
          <li key={channel.id}>
            <button
              type="button"
              onClick={() => onSelect(channel.id)}
              aria-pressed={isSelected}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "0.5rem 0.75rem",
                border: "none",
                borderRadius: "0.375rem",
                background: isSelected ? "#dbeafe" : "transparent",
                color: "#111827",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              <div style={{ fontWeight: 600 }}>{channel.name}</div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>mission:{channel.mission_id}</div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
