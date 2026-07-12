import type { ReactNode } from "react";
import Link from "next/link";
import { getSession } from "@/lib/session";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Zap, LogOut, Users } from "lucide-react";
import { FleetSwitcher } from "@/components/fleet/FleetSwitcher";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarNav } from "@/components/sidebar-nav";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata = {
  title: "GAMOPLS TeamCore",
  description: "Human-Machine Teaming Platform — MAP / CHAT / BOARD / HUB",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <html lang="en" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="dark">
        <div className="flex min-h-screen">
          {/* High Fidelity Sidebar */}
          <aside className="w-64 fixed inset-y-0 left-0 bg-card border-r border-border flex flex-col z-50">
            <div className="h-16 px-6 border-b border-border flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary fill-primary/20" />
              <Link href="/" className="font-bold text-lg tracking-tight text-foreground hover:opacity-90">
                GAMOPLS <span className="text-primary">TeamCore</span>
              </Link>
            </div>
            
            <SidebarNav />

            <div className="p-4 border-t border-border mt-auto bg-muted/30 space-y-3">
              <ThemeToggle />
              {session ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dispatcher Active</span>
                  </div>
                  <span className="text-xs font-medium text-foreground truncate max-w-full">
                    {session.user_id}
                  </span>
                  {session.role === "owner" && (
                    <a
                      href="/org"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Users className="h-3 w-3" />
                      Manage team
                    </a>
                  )}
                  <a href="/api/logout" className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 transition-colors mt-2">
                    <LogOut className="h-3 w-3" />
                    Sign Out
                  </a>
                </div>
              ) : (
                <Link href="/login" className="flex items-center justify-center w-full px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                  Log In
                </Link>
              )}
            </div>
          </aside>

          {/* Main Dashboard Layout Container */}
          <div className="flex-1 pl-64 flex flex-col">
            {/* Dashboard Sticky Header */}
            <header className="sticky top-0 h-16 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between px-8 z-40">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Fleet Control Center</h2>
                {session && (
                  <div className="flex gap-2">
                    <span className="inline-flex items-center rounded-full bg-blue-400/10 px-2.5 py-0.5 text-xs font-medium text-blue-400 border border-blue-400/20">org: {session.org_id}</span>
                    <FleetSwitcher currentFleetId={session.fleet_id} />
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground font-medium">
                GAMOPLS TeamCore MVP v1.0
              </div>
            </header>

            {/* Main Page Content */}
            <main className="flex-grow p-8 bg-background">
              <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
                {children}
              </div>
            </main>
          </div>
        </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
