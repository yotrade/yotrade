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

const ITEM =
  "flex h-12 items-center justify-center rounded-full transition-all duration-300 ease-out-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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
        className="fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),16px)] z-10 mx-auto flex w-fit animate-enter items-center gap-1 rounded-full bg-ink p-1.5 shadow-[0_8px_24px_#0e091c40]"
      >
        {TABS.map((tab) => {
          const active = tab.href === pathname;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              className={`${ITEM} gap-2 ${active ? "bg-surface px-5 text-ink" : "w-14 hover:bg-white/10"}`}
            >
              <Icon
                name={tab.icon}
                size={22}
                className={active ? "brightness-0" : "brightness-0 invert"}
              />
              {/* The label's column goes from 0fr to 1fr, so the pill widens instead of jumping. */}
              <span
                aria-hidden
                className={`grid transition-[grid-template-columns] duration-300 ease-out-soft ${active ? "grid-cols-[1fr]" : "grid-cols-[0fr]"}`}
              >
                <span className="overflow-hidden whitespace-nowrap text-[15px] font-bold italic">
                  {tab.label}
                </span>
              </span>
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
