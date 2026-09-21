import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

/** Kit button, size large: 48 px pill, 12/20 padding. Monad sets buttons in the mono face. */
const VARIANTS: Record<Variant, string> = {
  primary:
    "border border-accent bg-accent text-accent-ink shadow-button hover:bg-accent-strong active:bg-accent-strong",
  secondary: "bg-well text-ink hover:bg-border active:bg-border",
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
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 py-3 font-mono text-[15px] font-semibold tracking-tight transition duration-200 ease-out-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {pending ? "Confirming…" : children}
    </button>
  );
}
