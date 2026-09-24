"use client";

import Link from "next/link";
import { useState } from "react";

import { shortAddress } from "@/lib/format.ts";
import { hostedBy } from "@/lib/host.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useLocalProfile } from "@/lib/use-local-profile.ts";
import { useMyTournaments } from "@/lib/use-my-tournaments.ts";
import { useNow } from "@/lib/use-now.ts";
import { CodeEntry } from "./code-entry.tsx";
import { EntryCard } from "./entry-card.tsx";
import { TournamentRow } from "./tournament-row.tsx";
import { Avatar } from "./ui/avatar.tsx";
import { Icon, type IconName } from "./ui/icon.tsx";
import { SectionLabel } from "./ui/section-label.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";

const ACTIONS = [
  { href: "/new", icon: "plus", label: "Host a game", hint: "Your room, your rules" },
  { href: "/arena", icon: "stars", label: "Browse", hint: "Open games right now" },
] as const satisfies readonly { href: string; icon: IconName; label: string; hint: string }[];

const HOSTED_SHOWN = 4;

/** A game lobby first: the code box, then host or browse, then the games you are in or run. */
export function HomeScreen() {
  const now = useNow();
  const { identity } = useIdentity();
  const { tournaments, mine } = useMyTournaments();
  const [profile] = useLocalProfile();

  if (!identity) {
    return null;
  }
  const { address } = identity.wallet.account;
  const hosted = hostedBy(tournaments.data ?? [], address, now);
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

      <CodeEntry />

      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex flex-col items-start gap-3 rounded-2xl border border-border p-4 transition duration-200 hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.98]"
          >
            <Icon name={action.icon} />
            <span className="flex flex-col">
              <span className="font-semibold leading-tight">{action.label}</span>
              <span className="text-[13px] font-medium text-ink-muted">{action.hint}</span>
            </span>
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
          <SectionLabel>Your games</SectionLabel>
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

      {hosted.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel>Games you host</SectionLabel>
          <HostedList hosted={hosted} now={now} />
        </section>
      ) : null}
    </main>
  );
}

/** Running ones lead; past the first few, the rest wait behind a tap. */
function HostedList({ hosted, now }: { hosted: ReturnType<typeof hostedBy>; now: bigint }) {
  const [allHosted, setAllHosted] = useState(false);
  return (
    <>
      <ul className="flex flex-col gap-2">
        {(allHosted ? hosted : hosted.slice(0, HOSTED_SHOWN)).map(({ tournament, phase }) => (
          <li key={tournament.id.toString()} className="animate-enter">
            <TournamentRow tournament={tournament} phase={phase} now={now} />
          </li>
        ))}
      </ul>
      {hosted.length > HOSTED_SHOWN && !allHosted ? (
        <button
          type="button"
          onClick={() => setAllHosted(true)}
          className="self-center rounded-full px-4 py-2 font-mono text-[13px] font-semibold text-accent transition duration-200 hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-accent"
        >
          Show all {hosted.length}
        </button>
      ) : null}
    </>
  );
}
