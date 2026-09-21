import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110 active:scale-[0.98]",
  secondary: "bg-surface text-ink hover:bg-border active:scale-[0.98]",
  ghost: "text-ink-muted hover:text-ink",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
  /** Shows progress and blocks a second tap while a transaction is confirming. */
  readonly pending?: boolean;
}

export function Button({
  variant = "primary",
  pending = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || pending}
      aria-busy={pending}
      className={`inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 text-base font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {pending ? "Confirming…" : children}
    </button>
  );
}
