import { type SelectHTMLAttributes, useId } from "react";

export interface SelectProps<T extends string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  readonly label: string;
  readonly options: readonly T[];
  readonly value: T;
  onChange(next: T): void;
}

/** A labelled native select: the platform picker is the best one on a phone. */
export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  ...rest
}: SelectProps<T>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold tracking-tight text-ink">
        {label}
      </label>
      <div className="rounded-[18px] bg-well p-1">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className="min-h-14 w-full rounded-2xl bg-surface px-4 text-base font-medium text-ink shadow-row focus-visible:outline-2 focus-visible:outline-accent"
          {...rest}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
