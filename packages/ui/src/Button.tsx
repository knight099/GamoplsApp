import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: { 
    background: "var(--primary, #3b82f6)", 
    color: "var(--primary-foreground, #fff)", 
    border: "1px solid var(--primary, #3b82f6)" 
  },
  secondary: { 
    background: "var(--secondary, #1e293b)", 
    color: "var(--secondary-foreground, #f3f4f6)", 
    border: "1px solid var(--border, rgba(255,255,255,0.1))" 
  },
  danger: { 
    background: "var(--destructive, #ef4444)", 
    color: "var(--destructive-foreground, #fff)", 
    border: "1px solid var(--destructive, #ef4444)" 
  },
  ghost: { 
    background: "transparent", 
    color: "var(--foreground, #fff)", 
    border: "1px solid transparent" 
  },
};

const BASE_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  padding: "0.5rem 1rem",
  borderRadius: "var(--radius, 0.375rem)",
  fontSize: "0.875rem",
  fontWeight: 600,
  cursor: "pointer",
  lineHeight: 1.25,
  fontFamily: "inherit",
  transition: "background-color 0.2s, border-color 0.2s, opacity 0.2s",
};

/** Minimal shared button primitive. Inherits themes dynamically. */
export function Button({ variant = "primary", style, children, ...rest }: ButtonProps) {
  return (
    <button
      style={{ ...BASE_STYLE, ...VARIANT_STYLES[variant], ...style }}
      data-variant={variant}
      {...rest}
    >
      {children}
    </button>
  );
}
