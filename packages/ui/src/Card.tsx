import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Shared card container primitive inheriting shadcn vars. */
export function Card({ style, children, ...rest }: CardProps) {
  return (
    <div
      style={{
        border: "1px solid var(--border, rgba(255,255,255,0.1))",
        borderRadius: "var(--radius, 0.5rem)",
        padding: "1.5rem",
        background: "var(--card, #1e293b)",
        color: "var(--card-foreground, #f3f4f6)",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        transition: "transform 0.2s, box-shadow 0.2s",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
