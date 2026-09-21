"use client";

import { useQuery } from "@tanstack/react-query";
import { phaseAt } from "@yotrade/plugin-tournament/phase";
import Link from "next/link";

import { countdown, tournamentName } from "@/lib/format.ts";
import type { IndexedTournament } from "@/lib/indexer.ts";
import { indexer } from "@/lib/indexer-client.ts";
import { useNow } from "@/lib/use-now.ts";
import { PhaseBadge } from "./phase-badge.tsx";
import { Amount } from "./ui/amount.tsx";
import { Card } from "./ui/card.tsx";
import { Icon } from "./ui/icon.tsx";

function Row({ tournament, now }: { tournament: IndexedTournament; now: bigint }) {
  const phase = phaseAt(tournament, now);
  const schedule = countdown(phase, tournament, now);

  return (
    <Link
      href={`/t/${tournament.id}`}
      className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Card className="flex items-center gap-3 transition hover:bg-well">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft">
          <Icon name="crown" size={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate font-semibold leading-tight">
            {tournamentName(tournament.id, tournament.metadataURI)}
          </h3>
          <p className="tabular truncate text-sm font-medium text-ink-muted">
            {tournament.participantCount}/{tournament.maxParticipants} traders
            {schedule ? ` · ${schedule}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Amount value={tournament.prizePool} size="md" />
          <PhaseBadge phase={phase} />
        </div>
      </Card>
    </Link>
  );
}

export function TournamentList() {
  const now = useNow();
  const { data, isPending, isError } = useQuery({
    queryKey: ["tournaments"],
    queryFn: () => indexer.tournaments(),
    refetchInterval: 5_000,
  });

  if (isPending) {
    return <p className="text-sm text-ink-muted">Loading tournaments…</p>;
  }
  if (isError) {
    return (
      <p role="alert" className="text-sm text-down">
        Tournaments could not be loaded. Retrying…
      </p>
    );
  }
  if (data.length === 0) {
    return <p className="text-sm text-ink-muted">No tournaments yet. Host the first one.</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {data.map((tournament, index) => (
        <li
          key={tournament.id.toString()}
          className="animate-enter"
          style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
        >
          <Row tournament={tournament} now={now} />
        </li>
      ))}
    </ul>
  );
}
