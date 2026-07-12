import type { CSSProperties } from "react";

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
}

/**
 * Breadcrumb trail in the reference design's mono-microcap style. Renders
 * plain `<a>` tags (not next/link) since packages/ui has no dependency on
 * Next.js — breadcrumb navigation is low-traffic enough that a full page
 * load instead of client-side prefetch is an acceptable trade.
 */
export function Breadcrumb({ segments }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const textStyle: CSSProperties = {
          fontSize: "0.75rem",
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          color: isLast ? "var(--foreground)" : "var(--muted-foreground)",
        };
        return (
          <span key={`${segment.label}-${index}`} style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            {index > 0 && <span style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>/</span>}
            {segment.href && !isLast ? (
              <a href={segment.href} style={{ ...textStyle, textDecoration: "none" }}>
                {segment.label}
              </a>
            ) : (
              <span style={textStyle}>{segment.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
