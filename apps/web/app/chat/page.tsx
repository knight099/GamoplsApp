import { Card } from "@gamopls/ui";
import { getSession } from "@/lib/session";
import { ChatView } from "@/components/chat/ChatView";

/**
 * CHAT view (PLAN.md 6.5): mission channels + messages, built entirely
 * against the gateway established in apps/web/lib/gateway-proxy.ts —
 * components under components/chat/ call fetch('/api/chat/...') only, never
 * services/chat directly.
 *
 * This top-level page is a Server Component so it can read the verified
 * session (org_id/fleet_id/user_id) via getSession() the same way
 * app/layout.tsx does, then hand those down to the client-side ChatView.
 * Those values are NOT a trust boundary by themselves — the gateway route
 * handler re-verifies the JWT and forces org_id/fleet_id on every forwarded
 * request — they're only used here to populate the "create channel" request
 * body (services/chat's schema requires org_id/fleet_id there) and to stamp
 * outgoing messages with the sender's user id.
 */
export default async function ChatPage() {
  const session = await getSession();

  if (!session) {
    return (
      <Card>
        <h1>Chat</h1>
        <p style={{ color: "#6b7280" }}>Please log in to view mission channels.</p>
      </Card>
    );
  }

  return <ChatView orgId={session.org_id} fleetId={session.fleet_id} userId={session.user_id} />;
}
