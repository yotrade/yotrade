"use client";

import Link from "next/link";

import { shortAddress } from "@/lib/format.ts";
import { formatBps, roiBps } from "@/lib/ticket.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useLocalProfile } from "@/lib/use-local-profile.ts";
import { useMyTournaments } from "@/lib/use-my-tournaments.ts";
import { useNow } from "@/lib/use-now.ts";
import { EntryCard } from "./entry-card.tsx";
import { TournamentBrowser } from "./tournament-browser.tsx";
import { Amount } from "./ui/amount.tsx";
import { Avatar } from "./ui/avatar.tsx";
import { Icon, type IconName } from "./ui/icon.tsx";
import { SectionLabel } from "./ui/section-label.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";

const ACTIONS = [
  { href: "/arena", icon: "stars", label: "Join" },
  { href: "/new", icon: "plus", label: "Host" },
  { href: "/activity", icon: "gift", label: "Results" },
] as const satisfies readonly { href: string; icon: IconName; label: string }[];

function Headline({
  value,
  roi,
  accounts,
}: {
  value: bigint;
  roi: number | null;
  accounts: number;
}) {
  return (
    <div className="flex animate-fade flex-col gap-1">
      <p className="text-[13px] font-medium text-ink-muted">Across your live tournaments</p>
      <Amount value={value} size="xl" />
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
        <Icon name="arrow" size={16} />
        {roi === null ? (
          "Join a tournament to start trading"
        ) : (
          <>
            <span className={roi >= 0 ? "text-up" : "text-down"}>{formatBps(roi)}</span>
            {` · in ${accounts} live ${accounts === 1 ? "tournament" : "tournaments"}`}
          </>
        )}
      </p>
    </div>
  );
}

/** The kit's wallet home: account chip, balance, action tiles, cards, tabbed list. */
export function HomeScreen() {
  const now = useNow();
  const { identity } = useIdentity();
  const { tournaments, mine } = useMyTournaments();
  const [profile] = useLocalProfile();

  if (!identity) {
    return null;
  }
  const { address } = identity.wallet.account;
  const open = (mine.data ?? []).filter((item) => item.value !== null);
  const value = open.reduce((sum, item) => sum + (item.value ?? 0n), 0n);
  const capital = open.reduce((sum, item) => sum + item.entry.capitalAtJoin, 0n);
  const roi = roiBps(value, capital);
  // Until the accounts are known, zero is not an answer. A failed load falls through to the real states.
  const loading = !(mine.data || mine.isError || tournaments.isError);

  return (
    <main className="flex flex-1 flex-col gap-6 pb-28 pt-4">
      <h1 className="sr-only">Home</h1>
      <header>
        <Link
          href="/account"
          className="flex w-fit items-center gap-2 rounded-full bg-surface-raised py-1.5 pl-1.5 pr-4 text-left transition duration-200 hover:bg-well focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
        >
          <Avatar address={address} size={36} avatar={profile.avatar} />
          <span className="flex flex-col">
            <span className="max-w-40 truncate text-[11px] font-semibold leading-4 text-ink-muted">
              {profile.name || "Main account"}
            </span>
            <span className="font-mono text-[13px] font-semibold leading-4">
              {shortAddress(address)}
            </span>
          </span>
          <Icon name="chevron-right" size={14} className="ml-1" />
        </Link>
      </header>

      {loading ? (
        <Loading label="Loading your accounts" className="flex flex-col gap-2">
          <Skeleton className="h-12 w-44" />
          <Skeleton className="h-4 w-56" />
        </Loading>
      ) : (
        <Headline value={value} roi={roi} accounts={open.length} />
      )}

      <div className="grid grid-cols-3 gap-2">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex flex-col items-start gap-3 rounded-2xl border border-border p-3 transition duration-200 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.98]"
          >
            <Icon name={action.icon} />
            <span className="font-semibold leading-tight">{action.label}</span>
          </Link>
        ))}
      </div>

      {loading ? (
        <Loading label="Loading your tournaments" className="flex flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-[164px] w-[160px] rounded-3xl" />
            <Skeleton className="h-[164px] w-[160px] rounded-3xl" />
          </div>
        </Loading>
      ) : null}

      {mine.data && mine.data.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel>Your tournaments</SectionLabel>
          <ul className="-mx-5 flex snap-x gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {mine.data.map((item, index) => (
              <li
                key={item.tournament.id.toString()}
                className="animate-enter"
                style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
              >
                <EntryCard item={item} now={now} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TournamentBrowser tournaments={tournaments.data} failed={tournaments.isError} />
    </main>
  );
}
