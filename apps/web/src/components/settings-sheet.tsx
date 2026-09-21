"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { LANGUAGES, type LanguageCode } from "@/lib/languages.ts";
import { Icon } from "./ui/icon.tsx";
import { Sheet, SheetRow } from "./ui/sheet.tsx";

const LANGUAGE_KEY = "yotrade.language";
const CODES = Object.keys(LANGUAGES) as LanguageCode[];

function Flag({ code }: { code: LanguageCode }) {
  return (
    <Image
      src={`/flags/${code}.png`}
      alt=""
      aria-hidden
      width={24}
      height={24}
      className="size-6 shrink-0 rounded-full object-cover"
    />
  );
}

/** App preferences. Nothing about the person: that lives in the account sheet. */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [picking, setPicking] = useState(false);

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
          <button
            type="button"
            aria-expanded={picking}
            onClick={() => setPicking(!picking)}
            className="rounded-lg text-left focus-visible:outline-2 focus-visible:outline-accent"
          >
            <SheetRow icon={<Icon name="magic-wand" size={20} />} label="Commentary">
              <Flag code={language} />
              <span className="whitespace-nowrap">{LANGUAGES[language]}</span>
              <Icon
                name="chevron-right"
                size={14}
                className={`transition-transform duration-200 ${picking ? "-rotate-90" : "rotate-90"}`}
              />
            </SheetRow>
          </button>
          {picking ? (
            <ul className="grid animate-enter grid-cols-2 gap-1 py-2">
              {CODES.map((code) => (
                <li key={code}>
                  <button
                    type="button"
                    aria-pressed={code === language}
                    onClick={() => {
                      chooseLanguage(code);
                      setPicking(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-accent ${code === language ? "bg-accent-soft text-accent" : "bg-surface-raised hover:bg-well"}`}
                  >
                    <Flag code={code} />
                    <span className="truncate">{LANGUAGES[code]}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
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
