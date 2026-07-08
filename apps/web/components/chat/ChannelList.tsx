import { Spinner } from "@gamopls/ui";
import type { MissionChannel } from "./types";
import { Hash } from "lucide-react";

export interface ChannelListProps {
  channels: MissionChannel[];
  selectedChannelId: string | null;
  onSelect: (channelId: string) => void;
  loading: boolean;
  error: string | null;
}

export function ChannelList({ channels, selectedChannelId, onSelect, loading, error }: ChannelListProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center text-xs text-muted-foreground">
        <Spinner size={14} /> <span>Loading channels…</span>
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg">
        {error}
      </p>
    );
  }

  if (channels.length === 0) {
    return (
      <p className="text-xs font-medium text-muted-foreground p-3 text-center border border-dashed border-border rounded-lg">
        No mission channels yet — create one below.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {channels.map((channel) => {
        const isSelected = channel.id === selectedChannelId;
        return (
          <li key={channel.id}>
            <button
              type="button"
              onClick={() => onSelect(channel.id)}
              aria-pressed={isSelected}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-150 cursor-pointer ${
                isSelected 
                  ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-semibold" 
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground border border-transparent"
              }`}
            >
              <Hash className={`h-4 w-4 shrink-0 ${isSelected ? "text-cyan-400" : "text-muted-foreground/60"}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{channel.name}</div>
                <div className={`text-[10px] ${isSelected ? "text-cyan-400/80" : "text-muted-foreground/60"}`}>
                  mission: {channel.mission_id}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
