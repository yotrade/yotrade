"use client";

import { useQuery } from "@tanstack/react-query";
import { phaseAt } from "@yotrade/plugin-tournament/phase";
import Link from "next/link";

import { countdown, formatUsdc, shortAddress, tournamentName } from "@/lib/format.ts";
import { indexer } from "@/lib/indexer-client.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useNow } from "@/lib/use-now.ts";
import { JoinPanel } from "./join-panel.tsx";
import { Leaderboard } from "./leaderboard.tsx";
import { PhaseBadge } from "./phase-badge.tsx";
import { ResultsPanel } from "./results-panel.tsx";
import { Card } from "./ui/card.tsx";

const BPS = 10_000n;

export function TournamentDetail({ id }: { id: string }) {
  const now = useNow();
  const { identity } = useIdentity();
  const you = identity?.tournamentWallet(BigInt(id)).account.address;
  const { data, isPending, isError } = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => indexer.tournament(BigInt(id)),
    refetchInterval: 5_000,
  });

  if (isPending) {
    return <p className="py-10 text-sm text-ink-muted">Loading tournament…</p>;
  }
  if (isError) {
    return (
      <p role="alert" className="py-10 text-sm text-down">
        This tournament could not be loaded. Retrying…
      </p>
    );
  }
  if (!data) {
    return (
      <p className="py-10 text-sm text-ink-muted">
        Tournament #{id} was not found. If you just created it, it appears here within seconds.
      </p>
    );
  }

  const phase = phaseAt(data, now);
  const schedule =
    countdown(phase, data, now) || new Date(Number(data.endTime) * 1000).toLocaleString("en-US");

  return (
    <main className="flex flex-1 flex-col gap-6 py-8">
      <Link href="/" className="text-sm text-ink-muted hover:text-ink">
        ← All tournaments
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold leading-tight">
            {tournamentName(data.id, data.metadataURI)}
          </h1>
          <PhaseBadge phase={phase} />
        </div>
        <p className="tabular text-sm text-ink-muted">
          {schedule} · hosted by {shortAddress(data.organizer)}
        </p>
      </header>

      <Card className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-ink-muted">Prize pool</p>
          <p className="tabular text-xl font-bold">{formatUsdc(data.prizePool)} USDC</p>
        </div>
        <div>
          <p className="text-sm text-ink-muted">Starting capital</p>
          <p className="tabular text-xl font-bold">{formatUsdc(data.startingCapital)} USDC</p>
        </div>
        <ol className="col-span-2 flex flex-wrap gap-2">
          {data.prizeSplitBps.map((bps, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ranks are positional and never reorder
            <li key={index} className="tabular rounded-lg border border-border px-2.5 py-1 text-sm">
              #{index + 1} · {formatUsdc((data.prizePool * BigInt(bps)) / BPS)}
            </li>
          ))}
        </ol>
      </Card>

      <ResultsPanel tournament={data} phase={phase} now={now} />

      <JoinPanel tournament={data} phase={phase} />

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">
          Leaderboard{" "}
          <span className="tabular text-ink-muted">
            {data.participantCount}/{data.maxParticipants}
          </span>
        </h2>
        <Leaderboard id={id} you={you} />
      </section>
    </main>
  );
}
