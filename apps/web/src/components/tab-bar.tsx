"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "./ui/icon.tsx";

const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/arena", label: "Arena", icon: "stars" },
  { href: "/activity", label: "Activity", icon: "history" },
] as const satisfies readonly { href: string; label: string; icon: IconName }[];

/** Kit tab bar: a white 60 px row of 80 × 44 items. Root tabs only; detail screens use the back button. */
export function TabBar() {
  const pathname = usePathname();
  if (!TABS.some((tab) => tab.href === pathname)) {
    return null;
  }
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md justify-center gap-0 border-t border-border/60 bg-surface/90 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-3 backdrop-blur"
    >
      {TABS.map((tab) => {
        const active = tab.href === pathname;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className="flex h-11 w-20 flex-col items-center justify-center gap-0.5 rounded-2xl transition duration-200 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Icon name={tab.icon} className={active ? "" : "opacity-40 grayscale"} />
            <span
              className={`font-mono text-[10px] font-bold ${active ? "text-accent" : "text-ink-muted"}`}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
