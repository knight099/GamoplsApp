import type { HTMLAttributes } from "react";

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
  label?: string;
}

/** Minimal shared loading spinner primitive inheriting active theme accents. */
export function Spinner({ size = 16, label = "Loading", style, ...rest }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `${Math.max(2, size / 8)}px solid var(--border, rgba(255,255,255,0.1))`,
        borderTopColor: "var(--primary, #3b82f6)",
        borderRadius: "50%",
        animation: "gamopls-spin 0.7s linear infinite",
        ...style,
      }}
      {...rest}
    >
      <style>{"@keyframes gamopls-spin { to { transform: rotate(360deg); } }"}</style>
    </span>
  );
}
