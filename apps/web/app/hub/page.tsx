import { Card } from "@gamopls/ui";
import { getSession } from "@/lib/session";
import { HubView } from "@/components/hub/HubView";

/**
 * HUB view (PLAN.md 6.7): documents/knowledge base. Built entirely
 * against the gateway established in apps/web/lib/gateway-proxy.ts —
 * components under components/hub/ call fetch('/api/hub/...') only, never
 * services/hub directly.
 *
 * This top-level page is a Server Component so it can read the verified
 * session via getSession(), the same pattern app/chat/page.tsx and
 * app/map/page.tsx use. org_id/fleet_id scoping is entirely enforced by
 * the gateway (forced query params on every forwarded request); the only
 * session value HubView needs client-side is the uploader's user id, to
 * stamp uploads.
 */
export default async function HubPage() {
  const session = await getSession();

  if (!session) {
    return (
      <Card>
        <h1>Hub</h1>
        <p role="alert" style={{ color: "#991b1b" }}>
          You must be signed in to view documents.
        </p>
      </Card>
    );
  }

  return <HubView uploaderId={session.user_id} />;
}
