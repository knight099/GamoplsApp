import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

const TONE_STYLES: Record<BadgeTone, React.CSSProperties> = {
  neutral: { background: "#f3f4f6", color: "#374151" },
  success: { background: "#dcfce7", color: "#166534" },
  warning: { background: "#fef3c7", color: "#92400e" },
  danger: { background: "#fee2e2", color: "#991b1b" },
  info: { background: "#dbeafe", color: "#1e40af" },
};

/** Minimal shared status badge primitive, e.g. asset health / alert state. */
export function Badge({ tone = "neutral", style, children, ...rest }: BadgeProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.125rem 0.5rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 600,
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
