import type { ReactNode } from "react";

/** Re-mounts on every navigation, so each page eases in instead of snapping. */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 animate-enter flex-col">{children}</div>;
}
