"use client";

import Link from "next/link";

import { formatUsdc, tournamentName } from "@/lib/format.ts";
import { type MyTournament, useMyTournaments } from "@/lib/use-my-tournaments.ts";
import { PhaseBadge } from "./phase-badge.tsx";
import { Icon } from "./ui/icon.tsx";
import { RowsSkeleton } from "./ui/skeleton.tsx";

function outcome({ entry, phase }: MyTournament): { text: string; tone: string } {
  if (entry.claimed) {
    return { text: `Won $${formatUsdc(entry.prize)} · claimed`, tone: "text-ink-muted" };
  }
  if (entry.rank && entry.prize > 0n) {
    const ready = phase === "claimable";
    return {
      text: `Won $${formatUsdc(entry.prize)} · ${ready ? "claim it" : "in review"}`,
      tone: ready ? "text-up" : "text-accent",
    };
  }
  if (phase === "upcoming" || phase === "live") {
    return { text: `Joined with $${formatUsdc(entry.capitalAtJoin)}`, tone: "text-ink-muted" };
  }
  // Ended, but nobody has been named yet: the outcome is not known, so it is not "no prize".
  if (phase === "scoring") {
    return { text: "Ended · waiting for results", tone: "text-ink-muted" };
  }
  if (phase === "dispute") {
    return { text: "Results in review", tone: "text-accent" };
  }
  // A place with nothing attached (a friendly, or a rank the split does not pay) is still a place.
  if (entry.rank) {
    return {
      text: `Finished #${entry.rank}`,
      tone: entry.rank <= 3 ? "text-accent" : "text-ink-muted",
    };
  }
  return { text: "No prize this time", tone: "text-ink-muted" };
}

/** Everything this passkey took part in, newest first, with what came of it. */
export function ActivityScreen() {
  const { tournaments, mine } = useMyTournaments();

  let body = <RowsSkeleton label="Loading your activity" />;
  // `mine` waits for the tournament list, so a failed list would otherwise load forever.
  if (mine.isError || tournaments.isError) {
    body = (
      <p role="alert" className="text-sm font-medium text-down">
        Your activity could not be loaded. Retrying…
      </p>
    );
  } else if (mine.data?.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-3 rounded-[40px] bg-surface-raised p-8 text-center">
        <Icon name="history" size={40} />
        <p className="font-semibold">Nothing here yet</p>
        <p className="text-sm font-medium text-ink-muted">
          Tournaments you join show up here with their results.
        </p>
        <Link
          href="/arena"
          className="font-mono text-sm font-semibold text-accent hover:text-accent-strong"
        >
          Browse the arena
        </Link>
      </div>
    );
  } else if (mine.data) {
    body = (
      <ul className="flex flex-col gap-2">
        {mine.data.map((item, index) => {
          const { text, tone } = outcome(item);
          return (
            <li
              key={item.tournament.id.toString()}
              className="animate-enter"
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <Link
                href={`/t/${item.tournament.id}`}
                className="flex items-center gap-4 rounded-2xl bg-surface-raised p-4 transition duration-200 hover:bg-well focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.99]"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent">
                  <Icon
                    name={item.entry.rank ? "crown" : "swap"}
                    size={20}
                    className="brightness-0 invert"
                  />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate font-semibold leading-[21px]">
                    {tournamentName(item.tournament.id, item.tournament.metadataURI)}
                  </p>
                  <p className={`tabular truncate text-sm font-medium leading-5 ${tone}`}>{text}</p>
                </div>
                <PhaseBadge phase={item.phase} />
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-6 pb-28 pt-4">
      <h1 className="text-xl font-bold leading-[26px] tracking-tight">Activity</h1>
      {body}
    </main>
  );
}
