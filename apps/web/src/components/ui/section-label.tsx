import type { ReactNode } from "react";

/** Kit section label: 14 px semibold, muted. One tone darker than the kit so it passes AA on white. */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold tracking-tight text-ink-muted">{children}</h2>
      {action}
    </div>
  );
}
