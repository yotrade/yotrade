import type { HTMLAttributes } from "react";

/** Kit "container card": borderless, 16 px radius, 12/16 padding, a whisper of grey on a white screen. */
export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl bg-surface-raised px-4 py-3 ${className}`} {...rest} />;
}
