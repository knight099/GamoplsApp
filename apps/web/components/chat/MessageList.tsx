import { Badge, Spinner } from "@gamopls/ui";
import type { ChatMessage } from "./types";
import { MessageSquare } from "lucide-react";

export interface MessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageList({ messages, loading, error }: MessageListProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-xs text-muted-foreground">
        <Spinner size={14} /> <span>Loading messages…</span>
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 p-4 rounded-lg">
        {error}
      </p>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground space-y-2">
        <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-xs font-medium">No messages yet — say something below.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
      {messages.map((message) => {
        const isSystem = message.senderType === "system";
        return (
          <li 
            key={message.id} 
            data-testid="chat-message" 
            data-sender-type={message.senderType}
            className={`p-3 rounded-lg border text-sm transition-colors ${
              isSystem 
                ? "bg-rose-500/5 border-rose-500/20 text-rose-300" 
                : "bg-muted/30 border-border text-foreground"
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <span className={`font-semibold text-xs ${isSystem ? "text-rose-400" : "text-white"}`}>
                  {message.senderId}
                </span>
                {isSystem && (
                  <Badge tone="info">System alert</Badge>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground font-medium">
                {formatTimestamp(message.createdAt)}
              </span>
            </div>
            <p className="text-xs leading-relaxed break-words">{message.body}</p>
            {message.media && (
              <div className="mt-2 pt-2 border-t border-border/30">
                <a
                  href={message.media.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  📎 {message.media.filename} 
                  <span className="text-[10px] text-muted-foreground/80 font-normal">
                    ({message.media.mimeType}, {message.media.size} bytes)
                  </span>
                </a>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
