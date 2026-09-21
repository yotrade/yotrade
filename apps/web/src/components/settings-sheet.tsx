"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { shortAddress } from "@/lib/format.ts";
import { LANGUAGES, type LanguageCode } from "@/lib/languages.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { Avatar } from "./ui/avatar.tsx";
import { Icon, type IconName } from "./ui/icon.tsx";

const LANGUAGE_KEY = "yotrade.language";
const CODES = Object.keys(LANGUAGES) as LanguageCode[];

function Row({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-3">
      <span className="flex items-center gap-3 text-sm font-semibold tracking-tight">
        <Icon name={icon} size={20} />
        {label}
      </span>
      <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink-muted">
        {children}
      </span>
    </div>
  );
}

/** Kit settings sheet: a native dialog dressed as a bottom sheet (32 px corners, grab handle). */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { identity, signOut } = useIdentity();
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) {
      element.showModal();
      try {
        const saved = localStorage.getItem(LANGUAGE_KEY);
        setLanguage(CODES.find((code) => code === saved) ?? "en");
      } catch {
        // Private windows: the default stays.
      }
    }
    if (!open && element?.open) {
      element.close();
    }
  }, [open]);

  if (!identity) {
    return null;
  }
  const { address } = identity.wallet.account;

  function chooseLanguage(next: LanguageCode) {
    setLanguage(next);
    try {
      localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      // The choice simply does not survive a reload.
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && onClose()}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
      aria-label="Settings"
      className="m-0 mx-auto mt-auto w-full max-w-md animate-sheet rounded-t-[32px] bg-surface p-0 text-ink backdrop:bg-[#52525b]/60"
    >
      <div className="flex flex-col gap-6 px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-2.5">
        <span aria-hidden className="mx-auto h-[5px] w-[25px] rounded-full bg-[#d4d4d8]" />

        <div className="flex items-center gap-3 rounded-2xl bg-surface-raised p-3">
          <Avatar address={address} />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="font-semibold leading-[21px]">Account</p>
            <p className="truncate font-mono text-sm text-ink-muted">{shortAddress(address)}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(address);
              setCopied(true);
            }}
            className="rounded-lg bg-accent-soft px-2 py-1 font-mono text-xs font-bold text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <section className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-tight text-ink-muted">Preferences</h2>
          <div className="flex flex-col divide-y divide-border/60">
            <Row icon="magic-wand" label="Commentary language">
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
            </Row>
            <Row icon="external-link" label="Network">
              Monad testnet
            </Row>
            <Row icon="face-scan" label="Security">
              Passkey
            </Row>
          </div>
        </section>

        <button
          type="button"
          onClick={() => {
            onClose();
            signOut();
          }}
          className="min-h-12 rounded-full bg-down/10 font-mono text-[15px] font-semibold text-down transition duration-200 hover:bg-down/15 focus-visible:outline-2 focus-visible:outline-down active:scale-[0.98]"
        >
          Sign out
        </button>
      </div>
    </dialog>
  );
}
