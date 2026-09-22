"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { shortAddress } from "@/lib/format.ts";
import { LANGUAGES, type LanguageCode } from "@/lib/languages.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useLocalProfile } from "@/lib/use-local-profile.ts";
import { Avatar } from "./ui/avatar.tsx";
import { Icon } from "./ui/icon.tsx";
import { SectionLabel } from "./ui/section-label.tsx";
import { SheetRow as Row } from "./ui/sheet.tsx";

const EXPLORER = "https://testnet.monadvision.com/address/";
const LANGUAGE_KEY = "yotrade.language";
const CODES = Object.keys(LANGUAGES) as LanguageCode[];
const LINK = "rounded-lg text-left focus-visible:outline-2 focus-visible:outline-accent";

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

/** The commentary language. A preference, nothing sensitive; storage can be unavailable in private windows. */
function LanguageRow() {
  const [language, setLanguage] = useState<LanguageCode>("en");
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY);
      setLanguage(CODES.find((code) => code === saved) ?? "en");
    } catch {
      // The default stays.
    }
  }, []);

  function choose(next: LanguageCode) {
    setLanguage(next);
    setPicking(false);
    try {
      localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      // The choice simply does not survive a reload.
    }
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={picking}
        onClick={() => setPicking(!picking)}
        className={LINK}
      >
        <Row icon={<Icon name="magic-wand" size={20} />} label="Commentary">
          <Flag code={language} />
          <span className="whitespace-nowrap">{LANGUAGES[language]}</span>
          <Icon
            name="chevron-right"
            size={14}
            className={`transition-transform duration-200 ${picking ? "-rotate-90" : "rotate-90"}`}
          />
        </Row>
      </button>
      {picking ? (
        <ul className="grid animate-enter grid-cols-2 gap-1 py-2">
          {CODES.map((code) => (
            <li key={code}>
              <button
                type="button"
                aria-pressed={code === language}
                onClick={() => choose(code)}
                className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-accent ${code === language ? "bg-accent-soft text-accent" : "bg-surface-raised hover:bg-well"}`}
              >
                <Flag code={code} />
                <span className="truncate">{LANGUAGES[code]}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** Who you are and what you prefer, on one page. Home keeps the overview. */
export function AccountScreen() {
  const { identity, signOut } = useIdentity();
  const [profile] = useLocalProfile();
  const [copied, setCopied] = useState(false);
  if (!identity) {
    return null;
  }
  const { address } = identity.wallet.account;

  return (
    <main className="flex flex-1 flex-col gap-6 pb-28 pt-4">
      <h1 className="text-xl font-bold leading-[26px] tracking-tight">Account</h1>

      <div className="flex flex-col items-center gap-3 rounded-[32px] bg-surface-raised p-6">
        <Avatar address={address} size={72} avatar={profile.avatar} />
        {profile.name ? <p className="text-lg font-bold tracking-tight">{profile.name}</p> : null}
        <p className="font-mono text-sm font-semibold">{shortAddress(address)}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(address);
              setCopied(true);
            }}
            className="rounded-lg bg-accent-soft px-2 py-1 font-mono text-xs font-bold text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            {copied ? "Copied" : "Copy address"}
          </button>
          <Link
            href="/account/profile"
            className="rounded-lg bg-accent px-2 py-1 font-mono text-xs font-bold text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Edit profile
          </Link>
        </div>
      </div>

      <section className="flex flex-col gap-1">
        <SectionLabel>Preferences</SectionLabel>
        <div className="flex flex-col divide-y divide-border/60">
          <LanguageRow />
        </div>
      </section>

      <section className="flex flex-col gap-1">
        <SectionLabel>Security</SectionLabel>
        <div className="flex flex-col divide-y divide-border/60">
          <Row icon={<Icon name="face-scan" size={20} />} label="Secured by">
            Passkey
          </Row>
          <Row icon={<Icon name="credit-card" size={20} />} label="Trading accounts">
            One per tournament
          </Row>
          <a href={`${EXPLORER}${address}`} target="_blank" rel="noreferrer" className={LINK}>
            <Row icon={<Icon name="external-link" size={20} />} label="View on MonadVision">
              <Icon name="chevron-right" size={16} />
            </Row>
          </a>
        </div>
      </section>

      <section className="flex flex-col gap-1">
        <SectionLabel>About</SectionLabel>
        <div className="flex flex-col divide-y divide-border/60">
          <Row icon={<Icon name="external-link" size={20} />} label="Network">
            Monad testnet
          </Row>
          <Row icon={<Icon name="swap" size={20} />} label="Markets">
            Kuru Spot · Pyth Futures
          </Row>
          <Row icon={<Icon name="info" size={20} />} label="Funds">
            Test funds, no real value
          </Row>
        </div>
      </section>

      <button
        type="button"
        onClick={signOut}
        className="min-h-12 rounded-full bg-down/10 font-mono text-[15px] font-semibold text-down transition duration-200 hover:bg-down/15 focus-visible:outline-2 focus-visible:outline-down active:scale-[0.98]"
      >
        Sign out
      </button>
    </main>
  );
}
