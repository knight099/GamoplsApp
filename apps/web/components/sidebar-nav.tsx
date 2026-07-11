"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe, MessageSquare, ClipboardList, Files, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sidebar nav links with an active state driven by usePathname. Split into
 * its own client component because app/layout.tsx is an async Server
 * Component (same pattern as ThemeToggle).
 */
const NAV_LINKS = [
  { href: "/fleet", label: "Fleet", icon: Truck },
  { href: "/map", label: "Map", icon: Globe },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/board", label: "Board", icon: ClipboardList },
  { href: "/hub", label: "Hub", icon: Files },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 py-6 px-4 flex flex-col gap-1">
      {NAV_LINKS.map((link) => {
        const Icon = link.icon;
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
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
    </nav>
  );
}
