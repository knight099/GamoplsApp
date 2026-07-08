import type { HTMLAttributes } from "react";

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number;
  label?: string;
}

/** Minimal shared loading spinner primitive (CSS animation, no JS timers). */
export function Spinner({ size = 16, label = "Loading", style, ...rest }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: `${Math.max(2, size / 8)}px solid #e5e7eb`,
        borderTopColor: "#2563eb",
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
