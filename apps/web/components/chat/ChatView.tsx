"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@gamopls/ui";
import { createChannel, fetchChannels, fetchMessages, postMessage } from "./api";
import { ChannelList } from "./ChannelList";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import { NewChannelForm } from "./NewChannelForm";
import type { ChatMessage, MissionChannel } from "./types";

export interface ChatViewProps {
  userId: string;
}

export function ChatView({ userId }: ChatViewProps) {
  const [channels, setChannels] = useState<MissionChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState<string | null>(null);

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    setChannelsError(null);
    try {
      const result = await fetchChannels();
      setChannels(result);
      setSelectedChannelId((current) => current ?? result[0]?.id ?? null);
    } catch (err) {
      setChannelsError(err instanceof Error ? err.message : "Failed to load channels");
    } finally {
      setChannelsLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (channelId: string) => {
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const result = await fetchMessages(channelId);
      setMessages(result);
    } catch (err) {
      setMessagesError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    if (selectedChannelId) {
      void loadMessages(selectedChannelId);
    } else {
      setMessages([]);
    }
  }, [selectedChannelId, loadMessages]);

  async function handleCreateChannel(input: { mission_id: string; name: string }) {
    // Tenant scope is attached by the gateway (signed header) — never sent
    // from the client.
    const created = await createChannel(input);
    setChannels((current) => [...current, created]);
    setSelectedChannelId(created.id);
  }

  async function handleSendMessage(body: string) {
    if (!selectedChannelId) return;
    const created = await postMessage(selectedChannelId, { senderId: userId, body });
    setMessages((current) => [...current, created]);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
      <div className="lg:col-span-1 flex flex-col gap-6">
        <Card className="border border-border bg-card p-4">
          <h2 className="text-xs font-bold text-foreground mb-3 uppercase tracking-wider text-muted-foreground">
            Mission Channels
          </h2>
          <ChannelList
            channels={channels}
            selectedChannelId={selectedChannelId}
            onSelect={setSelectedChannelId}
            loading={channelsLoading}
            error={channelsError}
          />
        </Card>
        <NewChannelForm onCreate={handleCreateChannel} />
      </div>

      <div className="lg:col-span-3">
        <Card className="border border-border bg-card p-6 flex flex-col min-h-[450px]">
          {selectedChannelId ? (
            <div className="flex flex-col flex-1 justify-between gap-4">
              <MessageList messages={messages} loading={messagesLoading} error={messagesError} />
              <MessageComposer onSend={handleSendMessage} disabled={messagesLoading} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
              <p className="text-sm font-medium">
                {channelsLoading ? "Syncing..." : "No active channel selected."}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
