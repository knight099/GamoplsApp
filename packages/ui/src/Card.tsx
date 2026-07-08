import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Minimal shared card container primitive. */
export function Card({ style, children, ...rest }: CardProps) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "0.5rem",
        padding: "1rem",
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
