import { type InputHTMLAttributes, useId } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string;
}

/**
 * A labelled input in the kit's style: a grey well (18 px radius) holding a white row (16 px radius).
 * The error replaces the hint and is announced to assistive technology.
 */
export function Field({ label, hint, error, className = "", ...rest }: FieldProps) {
  const id = useId();
  const describedBy = error || hint ? `${id}-description` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold tracking-tight text-ink">
        {label}
      </label>
      <div className={`rounded-[18px] p-1 ${error ? "bg-down/10" : "bg-well"}`}>
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`tabular min-h-14 w-full rounded-2xl bg-surface px-4 text-base font-medium text-ink shadow-row placeholder:text-ink-muted/60 focus-visible:outline-2 focus-visible:outline-accent ${className}`}
          {...rest}
        />
      </div>
      {describedBy ? (
        <p
          id={describedBy}
          role={error ? "alert" : undefined}
          className={`text-[13px] leading-5 ${error ? "text-down" : "text-ink-muted"}`}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}
