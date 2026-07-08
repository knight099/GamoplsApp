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
  /** Current user's org/fleet scope and identity, resolved server-side from the session JWT (see app/chat/page.tsx). */
  orgId: string;
  fleetId: string;
  userId: string;
}

/**
 * Client-side orchestrator for the CHAT view: lists mission channels, shows
 * the selected channel's messages, and lets the user post new messages or
 * create a new channel. Talks to the backend exclusively via `/api/chat/...`
 * (see components/chat/api.ts) — never services/chat directly.
 */
export function ChatView({ orgId, fleetId, userId }: ChatViewProps) {
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
    const created = await createChannel({ org_id: orgId, fleet_id: fleetId, ...input });
    setChannels((current) => [...current, created]);
    setSelectedChannelId(created.id);
  }

  async function handleSendMessage(body: string) {
    if (!selectedChannelId) return;
    const created = await postMessage(selectedChannelId, { senderId: userId, body });
    setMessages((current) => [...current, created]);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: "1rem", alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <Card>
          <h2 style={{ fontSize: "0.9375rem", margin: "0 0 0.5rem" }}>Mission channels</h2>
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

      <Card style={{ display: "flex", flexDirection: "column", gap: "1rem", minHeight: "20rem" }}>
        {selectedChannelId ? (
          <>
            <MessageList messages={messages} loading={messagesLoading} error={messagesError} />
            <MessageComposer onSend={handleSendMessage} disabled={messagesLoading} />
          </>
        ) : (
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            {channelsLoading ? "Loading…" : "Select a mission channel to view its messages."}
          </p>
        )}
      </Card>
    </div>
  );
}
