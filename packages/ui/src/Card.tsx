import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Minimal shared card container primitive. */
export function Card({ className = "", style, children, ...rest }: CardProps & { className?: string }) {
  return (
    <div
      className={`saas-card ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}
