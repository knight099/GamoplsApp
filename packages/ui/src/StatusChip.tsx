import type { HTMLAttributes, ReactNode } from "react";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
  children: ReactNode;
}

const TONE_STYLES: Record<StatusTone, React.CSSProperties> = {
  neutral: {
    background: "var(--muted)",
    color: "var(--muted-foreground)",
    borderColor: "var(--border)",
  },
  success: {
    background: "rgba(16, 185, 129, 0.15)",
    color: "#34d399",
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  warning: {
    background: "rgba(245, 158, 11, 0.15)",
    color: "#fbbf24",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  danger: {
    background: "rgba(239, 68, 68, 0.15)",
    color: "#fca5a5",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  info: {
    background: "rgba(59, 130, 246, 0.15)",
    color: "#60a5fa",
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
};

/**
 * Status pill matching the reference design: sentence-case (not uppercase
 * or mono), small, tinted. Supersedes ad-hoc Badge-tone usage for
 * entity/event status going forward; Badge itself is unchanged.
 */
export function StatusChip({ tone, style, children, ...rest }: StatusChipProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.15rem 0.5rem",
        borderRadius: "var(--radius-sm, 0.25rem)",
        fontSize: "0.75rem",
        fontWeight: 500,
        border: "1px solid",
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
