import Link from "next/link";
import { Card } from "@gamopls/ui";
import { getSession } from "@/lib/session";

export default async function HomePage() {
  const session = await getSession();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 640 }}>
      <h1>GAMOPLS TeamCore</h1>
      <p style={{ color: "#4b5563" }}>
        Human-Machine Teaming Platform — MAP / CHAT / BOARD / HUB for GAMOPLS's Edge Box telemetry
        fleets.
      </p>
      <Card>
        {session ? (
          <p>
            Signed in as <strong>{session.user_id}</strong> (org <code>{session.org_id}</code>,
            fleet <code>{session.fleet_id}</code>). Use the nav above to open a view.
          </p>
        ) : (
          <p>
            You are not signed in. <Link href="/login">Log in</Link> to access MAP/CHAT/BOARD/HUB.
          </p>
        )}
      </Card>
    </div>
  );
}
