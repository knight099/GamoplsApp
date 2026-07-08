import type { ReactNode } from "react";
import Link from "next/link";
import { getSession } from "@/lib/session";
import "./globals.css";

export const metadata = {
  title: "GAMOPLS TeamCore",
  description: "Human-Machine Teaming Platform — MAP / CHAT / BOARD / HUB",
};

const NAV_LINKS = [
  { href: "/map", label: "Map", icon: "🌐" },
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/board", label: "Board", icon: "📋" },
  { href: "/hub", label: "Hub", icon: "📂" },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <html lang="en">
      <body>
        <div className="app-container">
          {/* High Fidelity Sidebar */}
          <aside className="sidebar">
            <Link href="/" className="sidebar-logo">
              <span style={{ fontSize: "1.5rem" }}>⚡</span> GAMOPLS
            </Link>
            
            <nav className="sidebar-nav">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="sidebar-link">
                  <span style={{ fontSize: "1.1rem" }}>{link.icon}</span>
                  {link.label}
                </Link>
              ))}
            </nav>

            <div style={{ marginTop: "auto", borderTop: "1px solid var(--border-color)", paddingTop: "1.5rem" }}>
              {session ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-emerald)" }} />
                    <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Active Session</span>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", wordBreak: "break-all" }}>
                    {session.user_id}
                  </span>
                  <a href="/api/logout" style={{ fontSize: "0.75rem", color: "var(--accent-rose)", textDecoration: "none", marginTop: "0.5rem" }}>
                    Sign Out →
                  </a>
                </div>
              ) : (
                <Link href="/login" className="btn-premium btn-premium-primary" style={{ width: "100%", textDecoration: "none" }}>
                  Log In
                </Link>
              )}
            </div>
          </aside>

          {/* Sticky Dashboard Header */}
          <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
            <header className="dashboard-header">
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Control Room</h2>
                {session && (
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <span className="neon-badge neon-badge-primary">org: {session.org_id}</span>
                    <span className="neon-badge neon-badge-cyan">fleet: {session.fleet_id}</span>
                  </div>
                )}
              </div>
              <div>
                <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                  GAMOPLS TeamCore MVP v1.0
                </span>
              </div>
            </header>

            {/* Main Content Area */}
            <main className="main-content">
              <div className="animate-fade-in">
                {children}
              </div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
