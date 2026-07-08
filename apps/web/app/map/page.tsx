import { Card } from "@gamopls/ui";
import { getSession } from "@/lib/session";
import { MapView } from "@/components/map/MapView";

/**
 * MAP view (PLAN.md 6.4). Live asset positions + geofence CRUD for the
 * logged-in user's fleet.
 *
 * `fleet_id` is read server-side from the verified session JWT (never
 * trusted from the client) and passed down as a prop only to build the
 * `/api/map/fleets/:fleetId/positions` REST path — actual org/fleet
 * scoping enforcement still happens at the gateway route handler
 * (apps/web/app/api/map/[...path]/route.ts), which overwrites any
 * org_id/fleet_id on every forwarded request regardless of what's sent.
 *
 * V1 simplification (see also components/map/MapView.tsx and
 * AssetPositionsTable.tsx): this renders a list/table of assets, not an
 * interactive Leaflet/Mapbox map — that would need an external tile
 * provider/API key and is out of scope for V1. Live updates are done via
 * polling `GET /api/map/fleets/:fleetId/positions`, not the WebSocket
 * endpoint `services/map` exposes — see MapView's doc comment for why.
 */
export default async function MapPage() {
  const session = await getSession();

  if (!session) {
    return (
      <Card>
        <h1>Map</h1>
        <p role="alert" style={{ color: "#991b1b" }}>
          You must be signed in to view the fleet map.
        </p>
      </Card>
    );
  }

  return <MapView fleetId={session.fleet_id} />;
}
