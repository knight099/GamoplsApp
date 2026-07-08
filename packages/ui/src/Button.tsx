import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: "#2563eb", color: "#fff", border: "1px solid #2563eb" },
  secondary: { background: "#fff", color: "#1f2937", border: "1px solid #d1d5db" },
  danger: { background: "#dc2626", color: "#fff", border: "1px solid #dc2626" },
  ghost: { background: "transparent", color: "#1f2937", border: "1px solid transparent" },
};

const BASE_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  padding: "0.5rem 1rem",
  borderRadius: "0.375rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: "pointer",
  lineHeight: 1.25,
};

/** Minimal shared button primitive. Not a design system — just enough to avoid ad-hoc buttons. */
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
