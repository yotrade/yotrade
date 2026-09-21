"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SettingsSheet } from "./settings-sheet.tsx";
import { Icon, type IconName } from "./ui/icon.tsx";

const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/arena", label: "Arena", icon: "stars" },
  { href: "/activity", label: "Activity", icon: "crown" },
] as const satisfies readonly { href: string; label: string; icon: IconName }[];

/*
 * Widths are fixed and share one duration and easing: while one item shrinks from 128 to 56 px the other
 * grows by the same amount, so the bar's own width never changes. Labels fade; they do not push.
 */
const ITEM =
  "flex h-12 items-center justify-center overflow-hidden rounded-full transition-[width,background-color] duration-300 ease-out-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * Floating pill: white icons on ink, and the active tab grows into a white pill with its label.
 * Root tabs only; detail screens use the back button.
 */
export function TabBar() {
  const pathname = usePathname();
  const [settings, setSettings] = useState(false);
  if (!TABS.some((tab) => tab.href === pathname)) {
    return null;
  }
  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),16px)] z-10 mx-auto flex w-fit items-center gap-1 rounded-full bg-ink p-1.5 shadow-[0_8px_24px_#0e091c40]"
      >
        {TABS.map((tab) => {
          const active = tab.href === pathname;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              className={`${ITEM} gap-2 ${active ? "w-32 bg-surface text-ink" : "w-14 hover:bg-white/10"}`}
            >
              <Icon
                name={tab.icon}
                size={22}
                className={active ? "brightness-0" : "brightness-0 invert"}
              />
              {active ? (
                <span
                  aria-hidden
                  className="animate-enter whitespace-nowrap text-[15px] font-bold italic"
                >
                  {tab.label}
                </span>
              ) : null}
            </Link>
          );
        })}
        <button
          type="button"
          aria-label="Settings"
          aria-haspopup="dialog"
          onClick={() => setSettings(true)}
          className={`${ITEM} w-14 hover:bg-white/10`}
        >
          <Icon name="cog" size={22} className="brightness-0 invert" />
        </button>
      </nav>
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
    </>
  );
}
