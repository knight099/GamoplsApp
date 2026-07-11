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
 * session via getSession() the same way app/layout.tsx does. Tenant scope
 * (org/fleet) is enforced entirely at the gateway — it mints a signed
 * scope header on every forwarded request — so the only session value the
 * client view needs is the user id, to stamp outgoing messages with their
 * sender.
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

  return <ChatView userId={session.user_id} />;
}
