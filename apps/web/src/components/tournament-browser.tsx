"use client";

import { type Phase, phaseAt } from "@yotrade/plugin-tournament/phase";
import { useState } from "react";

import type { IndexedTournament } from "@/lib/indexer.ts";
import { useNow } from "@/lib/use-now.ts";
import { TournamentRow } from "./tournament-row.tsx";
import { TabMenu } from "./ui/tab-menu.tsx";

const TABS = ["Live", "Upcoming", "Finished"] as const;
type Tab = (typeof TABS)[number];

const TAB_OF: Record<Phase, Tab> = {
  live: "Live",
  upcoming: "Upcoming",
  scoring: "Finished",
  dispute: "Finished",
  claimable: "Finished",
  cancelled: "Finished",
  unknown: "Finished",
};

const EMPTY: Record<Tab, string> = {
  Live: "Nothing is live right now.",
  Upcoming: "Nothing scheduled. Host the next one.",
  Finished: "No finished tournaments yet.",
};

interface Props {
  readonly tournaments: readonly IndexedTournament[] | undefined;
  readonly failed: boolean;
}

/** The kit's tabbed asset panel, holding tournaments instead of tokens. */
export function TournamentBrowser({ tournaments, failed }: Props) {
  const now = useNow();
  const [tab, setTab] = useState<Tab>("Live");

  let body = <p className="text-sm font-medium text-ink-muted">Loading tournaments…</p>;
  if (failed) {
    body = (
      <p role="alert" className="text-sm font-medium text-down">
        Tournaments could not be loaded. Retrying…
      </p>
    );
  } else if (tournaments) {
    const rows = tournaments
      .map((tournament) => ({ tournament, phase: phaseAt(tournament, now) }))
      .filter((row) => TAB_OF[row.phase] === tab);
    body =
      rows.length === 0 ? (
        <p className="text-sm font-medium text-ink-muted">{EMPTY[tab]}</p>
      ) : (
        <ul key={tab} className="flex flex-col gap-2">
          {rows.map(({ tournament, phase }, index) => (
            <li
              key={tournament.id.toString()}
              className="animate-enter"
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <TournamentRow tournament={tournament} phase={phase} now={now} />
            </li>
          ))}
        </ul>
      );
  }

  return (
    <section className="flex flex-col gap-6">
      <TabMenu<Tab> label="Tournaments" tabs={TABS} value={tab} onChange={setTab} />
      {body}
    </section>
  );
}
