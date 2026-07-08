import Link from "next/link";
import { getSession } from "@/lib/session";

export default async function HomePage() {
  const session = await getSession();

  const MODULES = [
    {
      title: "Geospatial Tracking",
      href: "/map",
      desc: "Live asset tracking, real-time telemetry streaming, and dynamic geofencing exits monitor.",
      icon: "🌐",
      badgeColor: "cyan"
    },
    {
      title: "Operations Board",
      href: "/board",
      desc: "Mission planning, task workflow management, and autonomous AI engine agent triage.",
      icon: "📋",
      badgeColor: "primary"
    },
    {
      title: "Tactical Messaging",
      href: "/chat",
      desc: "Instant dispatcher messaging, channel grouping, and automated mission warning logs.",
      icon: "💬",
      badgeColor: "emerald"
    },
    {
      title: "Fleet Knowledge Hub",
      href: "/hub",
      desc: "Document metadata catalogs, keyword search indexing, and RAG knowledge base stubs.",
      icon: "📂",
      badgeColor: "warning"
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem", maxWidth: 1000, margin: "0 auto" }}>
      {/* Hero Welcome Banner */}
      <section style={{ 
        background: "linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)", 
        border: "1px solid var(--border-color)", 
        borderRadius: "1.5rem", 
        padding: "3rem",
        boxShadow: "var(--shadow-card)"
      }}>
        <h1 style={{ fontSize: "2.5rem", marginBottom: "1rem", background: "linear-gradient(to right, #fff, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Human-Machine Fleet Control Cockpit
        </h1>
        <p style={{ fontSize: "1.125rem", color: "var(--text-muted)", maxWidth: 700, marginBottom: "2rem" }}>
          GAMOPLS TeamCore provides real-time telemetry processing, mission task allocation, channel communications, and predictive model scoring for pilot edge boxes.
        </p>

        {session ? (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem" }}>
            <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>Tenant Authorization:</span>
            <span className="neon-badge neon-badge-primary">org: {session.org_id}</span>
            <span className="neon-badge neon-badge-cyan">fleet: {session.fleet_id}</span>
            <span className="neon-badge neon-badge-emerald">role: {session.role}</span>
          </div>
        ) : (
          <div>
            <Link href="/login" className="btn-premium btn-premium-primary" style={{ textDecoration: "none" }}>
              Authenticate Fleet Access →
            </Link>
          </div>
        )}
      </section>

      {/* Grid Modules */}
      <div>
        <h2 style={{ fontSize: "1.5rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.75rem" }}>
          Operational Modules
        </h2>
        
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1.5rem" }}>
          {MODULES.map((mod) => (
            <Link key={mod.href} href={mod.href} style={{ textDecoration: "none" }}>
              <div className="saas-card" style={{ height: "100%", display: "flex", flexDirection: "column", justifyItems: "flex-start" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <span style={{ fontSize: "2rem" }}>{mod.icon}</span>
                  <span className={`neon-badge neon-badge-${mod.badgeColor}`}>Ready</span>
                </div>
                <h3 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>{mod.title}</h3>
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", flexGrow: 1 }}>{mod.desc}</p>
                <div style={{ marginTop: "1.5rem", fontSize: "0.875rem", color: "var(--accent-cyan)", fontWeight: 600 }}>
                  Access Module →
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
