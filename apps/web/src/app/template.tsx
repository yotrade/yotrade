import type { ReactNode } from "react";

/**
 * Re-mounts on every navigation, so each page eases in instead of snapping. Opacity only: a transform here would
 * make this wrapper the containing block of every `position: fixed` bar inside a page.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 animate-fade flex-col">{children}</div>;
}
