"use client";

import { useState } from "react";

import { Icon } from "./icon.tsx";

interface Props<T extends string> {
  readonly label: string;
  readonly options: readonly T[];
  readonly value: T;
  onChange(next: T): void;
}

/** A compact chip that opens a short list. Closes on choice, Escape, and when focus leaves it. */
export function Dropdown<T extends string>({ label, options, value, onChange }: Props<T>) {
  const [open, setOpen] = useState(false);
  return (
    // The group only listens for focus leaving and Escape bubbling up from its own buttons.
    <fieldset
      aria-label={label}
      className="relative"
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setOpen(false)}
      onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${label}: ${value}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-9 items-center gap-1.5 rounded-xl bg-well px-3 font-mono text-xs font-bold transition duration-200 hover:bg-border focus-visible:outline-2 focus-visible:outline-accent"
      >
        {value}
        <Icon
          name="chevron-right"
          size={12}
          className={`transition-transform duration-200 ${open ? "-rotate-90" : "rotate-90"}`}
        />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={label}
          className="absolute right-0 top-full z-20 mt-1 flex min-w-28 animate-enter flex-col gap-0.5 rounded-2xl border border-border bg-surface p-1 shadow-[0_8px_24px_#0e091c1f]"
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === value}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={`rounded-xl px-3 py-2 text-left font-mono text-xs font-bold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-accent ${option === value ? "bg-accent-soft text-accent" : "hover:bg-well"}`}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}
