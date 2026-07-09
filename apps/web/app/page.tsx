import Link from "next/link";
import { getSession } from "@/lib/session";
import { Globe, ClipboardList, MessageSquare, Files, ArrowRight, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const session = await getSession();

  const MODULES = [
    {
      title: "Geospatial Tracking",
      href: "/map",
      desc: "Live asset tracking, real-time telemetry streaming, and dynamic geofencing exit monitoring.",
      icon: Globe,
      colorClass: "text-cyan-400 border-cyan-500/20 bg-cyan-500/5",
      badgeText: "Real-time"
    },
    {
      title: "Operations Board",
      href: "/board",
      desc: "Mission planning, task workflow management, and autonomous AI health scoring triage.",
      icon: ClipboardList,
      colorClass: "text-blue-400 border-blue-500/20 bg-blue-500/5",
      badgeText: "AI Engine"
    },
    {
      title: "Tactical Messaging",
      href: "/chat",
      desc: "Instant dispatcher communications, group channels, and automated event log streaming.",
      icon: MessageSquare,
      colorClass: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
      badgeText: "Secure"
    },
    {
      title: "Fleet Knowledge Hub",
      href: "/hub",
      desc: "Document metadata catalogs, keyword searching, and indexed technical schematics.",
      icon: Files,
      colorClass: "text-amber-400 border-amber-500/20 bg-amber-500/5",
      badgeText: "Knowledge"
    }
  ];

  return (
    <div className="space-y-12">
      {/* Hero Welcome Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card/50 p-8 md:p-12 shadow-2xl backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 opacity-30 pointer-events-none" />
        
        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary border border-primary/20">
            <ShieldCheck className="h-3.5 w-3.5" />
            Active Fleet Operation Shield
          </div>
          
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
            Human-Machine Fleet <br className="hidden md:inline" />
            Control Cockpit
          </h1>
          
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl font-medium">
            GAMOPLS TeamCore provides real-time telemetry processing, mission task allocation, channel communications, and predictive model scoring for pilot edge boxes.
          </p>

          {session ? (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Session Scopes:</span>
              <span className="inline-flex items-center rounded-full bg-blue-400/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400 border border-blue-400/20">org: {session.org_id}</span>
              <span className="inline-flex items-center rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-400 border border-cyan-400/20">fleet: {session.fleet_id}</span>
              <span className="inline-flex items-center rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-400/20">role: {session.role}</span>
            </div>
          ) : (
            <div className="pt-2">
              <Link href="/login" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90 transition-opacity">
                Authenticate Fleet Access
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Grid Modules */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Operational Modules</h2>
          <p className="text-sm text-muted-foreground mt-1">Select an index below to manage telemetry and task workflows.</p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link key={mod.href} href={mod.href} className="group block">
                <Card className="h-full border border-border bg-card/30 hover:bg-card/80 hover:border-muted-foreground/30 transition-all duration-300 shadow-lg hover:shadow-2xl hover:-translate-y-1">
                  <CardHeader className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className={`p-3 rounded-lg border ${mod.colorClass}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {mod.badgeText}
                      </span>
                    </div>
                    <CardTitle className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                      {mod.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm font-medium text-muted-foreground leading-relaxed">
                      {mod.desc}
                    </CardDescription>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mt-6 opacity-80 group-hover:opacity-100 transition-opacity">
                      Open Module
                      <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
