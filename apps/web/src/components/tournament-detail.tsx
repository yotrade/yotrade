"use client";

import { useQuery } from "@tanstack/react-query";
import { phaseAt } from "@yotrade/plugin-tournament/phase";
import Link from "next/link";

import { countdown, formatUsdc, shortAddress, tournamentName } from "@/lib/format.ts";
import { indexer } from "@/lib/indexer-client.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useNow } from "@/lib/use-now.ts";
import { Commentary } from "./commentary.tsx";
import { JoinPanel } from "./join-panel.tsx";
import { Leaderboard } from "./leaderboard.tsx";
import { PhaseBadge } from "./phase-badge.tsx";
import { ResultsPanel } from "./results-panel.tsx";
import { Amount } from "./ui/amount.tsx";
import { Card } from "./ui/card.tsx";
import { Icon } from "./ui/icon.tsx";
import { SectionLabel } from "./ui/section-label.tsx";

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
    <main className="flex flex-1 flex-col gap-6 pb-10 pt-4">
      <header className="flex flex-col gap-4">
        <Link
          href="/"
          aria-label="All tournaments"
          className="grid size-10 place-items-center rounded-full bg-well hover:bg-border focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Icon name="chevron-left" size={20} />
        </Link>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold leading-tight tracking-tight">
              {tournamentName(data.id, data.metadataURI)}
            </h1>
            <PhaseBadge phase={phase} />
          </div>
          <p className="tabular text-sm font-medium text-ink-muted">
            {schedule} · hosted by {shortAddress(data.organizer)}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-1">
        <Card className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-ink-muted">Prize pool</p>
          <Amount value={data.prizePool} size="lg" />
        </Card>
        <Card className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-ink-muted">Starting capital</p>
          <Amount value={data.startingCapital} size="lg" />
        </Card>
        <Card className="col-span-2">
          <ol className="flex flex-wrap gap-1.5">
            {data.prizeSplitBps
              .map((bps, index) => ({ rank: index + 1, bps }))
              .map(({ rank, bps }) => (
                <li
                  key={rank}
                  className="tabular rounded-lg bg-accent-soft px-2 py-1 font-mono text-xs font-bold text-accent"
                >
                  #{rank} · {formatUsdc((data.prizePool * BigInt(bps)) / BPS)}
                </li>
              ))}
          </ol>
        </Card>
      </div>

      <ResultsPanel tournament={data} phase={phase} now={now} />

      <JoinPanel tournament={data} phase={phase} />

      <Commentary id={id} name={tournamentName(data.id, data.metadataURI)} />

      <section className="flex flex-col gap-3">
        <SectionLabel>
          Leaderboard · {data.participantCount}/{data.maxParticipants}
        </SectionLabel>
        <Leaderboard id={id} you={you} />
      </section>
    </main>
  );
}
