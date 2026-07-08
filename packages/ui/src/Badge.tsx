import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

const TONE_STYLES: Record<BadgeTone, React.CSSProperties> = {
  neutral: { 
    background: "rgba(255, 255, 255, 0.05)", 
    color: "var(--muted-foreground, #9ca3af)", 
    borderColor: "var(--border, rgba(255,255,255,0.08))" 
  },
  success: { 
    background: "rgba(16, 185, 129, 0.15)", 
    color: "#34d399", 
    borderColor: "rgba(16, 185, 129, 0.3)" 
  },
  warning: { 
    background: "rgba(245, 158, 11, 0.15)", 
    color: "#fbbf24", 
    borderColor: "rgba(245, 158, 11, 0.3)" 
  },
  danger: { 
    background: "rgba(239, 68, 68, 0.15)", 
    color: "#fca5a5", 
    borderColor: "rgba(239, 68, 68, 0.3)" 
  },
  info: { 
    background: "rgba(59, 130, 246, 0.15)", 
    color: "#60a5fa", 
    borderColor: "rgba(59, 130, 246, 0.3)" 
  },
};

/** Minimal shared status badge primitive. Inherits variables for sharp SaaS style. */
export function Badge({ tone = "neutral", style, children, ...rest }: BadgeProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.2rem 0.6rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        border: "1px solid",
        letterSpacing: "0.02em",
        ...TONE_STYLES[tone],
        ...style,
      }}
      data-tone={tone}
      {...rest}
    >
      {children}
    </span>
  );
}
