import { type InputHTMLAttributes, useId } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
}

/** A labelled input. The error replaces the hint and is announced to assistive technology. */
export function Field({ label, hint, error, className = "", ...rest }: FieldProps) {
  const id = useId();
  const describedBy = error || hint ? `${id}-description` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`tabular min-h-12 rounded-2xl border bg-surface px-4 text-base text-ink placeholder:text-ink-muted/60 focus-visible:outline-2 focus-visible:outline-accent ${error ? "border-down" : "border-transparent"} ${className}`}
        {...rest}
      />
      {describedBy ? (
        <p
          id={describedBy}
          role={error ? "alert" : undefined}
          className={`text-sm ${error ? "text-down" : "text-ink-muted"}`}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}
