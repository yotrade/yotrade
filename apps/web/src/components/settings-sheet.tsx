"use client";

import { useEffect, useState } from "react";

import { LANGUAGES, type LanguageCode } from "@/lib/languages.ts";
import { Icon } from "./ui/icon.tsx";
import { Sheet, SheetRow } from "./ui/sheet.tsx";

const LANGUAGE_KEY = "yotrade.language";
const CODES = Object.keys(LANGUAGES) as LanguageCode[];

/** App preferences. Nothing about the person: that lives in the account sheet. */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const [language, setLanguage] = useState<LanguageCode>("en");

  useEffect(() => {
    if (!open) {
      return;
    }
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY);
      setLanguage(CODES.find((code) => code === saved) ?? "en");
    } catch {
      // Private windows: the default stays.
    }
  }, [open]);

  function chooseLanguage(next: LanguageCode) {
    setLanguage(next);
    try {
      localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      // The choice simply does not survive a reload.
    }
  }

  return (
    <Sheet open={open} onClose={onClose} label="Settings">
      <h2 className="text-xl font-bold leading-[26px] tracking-tight">Settings</h2>
      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold tracking-tight text-ink-muted">Preferences</h3>
        <div className="flex flex-col divide-y divide-border/60">
          <SheetRow icon={<Icon name="magic-wand" size={20} />} label="Commentary language">
            <select
              aria-label="Commentary language"
              value={language}
              onChange={(event) => chooseLanguage(event.target.value as LanguageCode)}
              className="bg-transparent text-right font-semibold text-ink-muted focus-visible:outline-2 focus-visible:outline-accent"
            >
              {CODES.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGES[code]}
                </option>
              ))}
            </select>
          </SheetRow>
        </div>
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold tracking-tight text-ink-muted">About</h3>
        <div className="flex flex-col divide-y divide-border/60">
          <SheetRow icon={<Icon name="external-link" size={20} />} label="Network">
            Monad testnet
          </SheetRow>
          <SheetRow icon={<Icon name="swap" size={20} />} label="Markets">
            Kuru Spot
          </SheetRow>
          <SheetRow icon={<Icon name="info" size={20} />} label="Funds">
            Test funds, no real value
          </SheetRow>
        </div>
      </section>
    </Sheet>
  );
}
