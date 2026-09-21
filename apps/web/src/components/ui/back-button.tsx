"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { Icon } from "./icon.tsx";

/** Whether this tab has moved between pages inside the app, as opposed to landing on a deep link. */
let navigatedInApp = false;
let firstPath: string | null = null;

/** Mounted once in the layout: notes the first path and flips the flag on the first in-app navigation. */
export function NavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (firstPath === null) {
      firstPath = pathname;
    } else if (pathname !== firstPath) {
      navigatedInApp = true;
    }
  }, [pathname]);
  return null;
}

/** Kit back button. Goes where the visitor came from; a deep link has no "back", so it goes to `fallback`. */
export function BackButton({
  fallback = "/",
  label = "Back",
}: {
  fallback?: "/" | "/arena";
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => (navigatedInApp ? router.back() : router.push(fallback))}
      className="grid size-10 shrink-0 place-items-center rounded-full bg-well transition duration-200 hover:bg-border focus-visible:outline-2 focus-visible:outline-accent active:scale-95"
    >
      <Icon name="chevron-left" size={20} />
    </button>
  );
}
