"use client";

import { useQuery } from "@tanstack/react-query";
import { phaseAt } from "@yotrade/plugin-tournament/phase";
import Link from "next/link";

import { countdown, formatUsdc, tournamentName } from "@/lib/format.ts";
import type { IndexedTournament } from "@/lib/indexer.ts";
import { indexer } from "@/lib/indexer-client.ts";
import { useNow } from "@/lib/use-now.ts";
import { PhaseBadge } from "./phase-badge.tsx";
import { Card } from "./ui/card.tsx";

function Row({ tournament, now }: { tournament: IndexedTournament; now: bigint }) {
  const phase = phaseAt(tournament, now);
  const schedule = countdown(phase, tournament, now);

  return (
    <Link
      href={`/t/${tournament.id}`}
      className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Card className="flex flex-col gap-2 transition hover:border-accent">
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate font-semibold">
            {tournamentName(tournament.id, tournament.metadataURI)}
          </h3>
          <PhaseBadge phase={phase} />
        </div>
        <p className="tabular text-2xl font-bold">
          {formatUsdc(tournament.prizePool)}{" "}
          <span className="text-sm font-medium text-ink-muted">USDC pool</span>
        </p>
        <p className="tabular text-sm text-ink-muted">
          {tournament.participantCount}/{tournament.maxParticipants} traders
          {schedule ? ` · ${schedule}` : ""}
        </p>
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
    <ul className="flex flex-col gap-3">
      {data.map((tournament) => (
        <li key={tournament.id.toString()}>
          <Row tournament={tournament} now={now} />
        </li>
      ))}
    </ul>
  );
}
