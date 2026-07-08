import type { ReactNode } from "react";
import Link from "next/link";
import { getSession } from "@/lib/session";

export const metadata = {
  title: "GAMOPLS TeamCore",
  description: "Human-Machine Teaming Platform — MAP / CHAT / BOARD / HUB",
};

const NAV_LINKS = [
  { href: "/map", label: "Map" },
  { href: "/chat", label: "Chat" },
  { href: "/board", label: "Board" },
  { href: "/hub", label: "Hub" },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", color: "#111827" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1.5rem",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <Link href="/" style={{ fontWeight: 700, textDecoration: "none", color: "#111827" }}>
            GAMOPLS TeamCore
          </Link>
          <nav style={{ display: "flex", gap: "1rem" }}>
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} style={{ color: "#374151", textDecoration: "none" }}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div>
            {session ? (
              <span style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                {session.user_id} · org:{session.org_id} · fleet:{session.fleet_id}
              </span>
            ) : (
              <Link href="/login" style={{ color: "#2563eb", textDecoration: "none" }}>
                Log in
              </Link>
            )}
          </div>
        </header>
        <main style={{ padding: "1.5rem" }}>{children}</main>
      </body>
    </html>
  );
}
