"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Globe, MessageSquare, ClipboardList, Files, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  icon: typeof Truck;
}

interface NavGroup {
  heading: string;
  links: NavLink[];
}

/**
 * Grouped sidebar IA (suggestions.md §3). "Board"/"Hub" are relabeled to
 * "Tasks"/"Documents" — the routes underneath (`/board`, `/hub`) are
 * unchanged; a full route rename would touch every Link/test/gateway-proxy
 * path mapping for no functional gain.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Operations",
    links: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/map", label: "Map", icon: Globe },
    ],
  },
  {
    heading: "Fleet",
    links: [{ href: "/fleet", label: "Fleet", icon: Truck }],
  },
  {
    heading: "Workspace",
    links: [
      { href: "/board", label: "Tasks", icon: ClipboardList },
      { href: "/chat", label: "Chat", icon: MessageSquare },
      { href: "/hub", label: "Documents", icon: Files },
    ],
  },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 py-6 px-4 flex flex-col gap-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.heading} className="flex flex-col gap-1">
          <span
            className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
          >
            {group.heading}
          </span>
          {group.links.map((link) => {
            const Icon = link.icon;
            // "/" needs an exact match (a prefix match would mark it active on every route); every other link keeps the prefix match so nested routes (e.g. /board/123) still highlight their parent.
            const active =
              link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
