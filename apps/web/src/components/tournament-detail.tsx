"use client";

import { useQuery } from "@tanstack/react-query";
import { phaseAt } from "@yotrade/plugin-tournament/phase";
import Link from "next/link";
import { useState } from "react";

import { formatUsdc, shortAddress, timeLeft, tournamentName } from "@/lib/format.ts";
import { indexer } from "@/lib/indexer-client.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useNow } from "@/lib/use-now.ts";
import { Commentary } from "./commentary.tsx";
import { JoinPanel } from "./join-panel.tsx";
import { Leaderboard } from "./leaderboard.tsx";
import { PhaseBadge } from "./phase-badge.tsx";
import { ResultsPanel } from "./results-panel.tsx";
import { Card } from "./ui/card.tsx";
import { Icon } from "./ui/icon.tsx";
import { TabMenu } from "./ui/tab-menu.tsx";

const BPS = 10_000n;
const TABS = ["Overview", "Leaderboard"] as const;
type Tab = (typeof TABS)[number];

export function TournamentDetail({ id }: { id: string }) {
  const now = useNow();
  const [tab, setTab] = useState<Tab>("Overview");
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

  return (
    <main className="flex flex-1 flex-col gap-6 pb-10 pt-4">
      <header className="flex items-center gap-3">
        <Link
          href="/"
          aria-label="All tournaments"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-well transition duration-200 hover:bg-border focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Icon name="chevron-left" size={20} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold leading-[26px] tracking-tight">
          {tournamentName(data.id, data.metadataURI)}
        </h1>
        <PhaseBadge phase={phase} />
      </header>

      {/* Kit wallet card, full width: the one number that matters, then the facts around it. */}
      <section className="flex flex-col gap-5 rounded-[28px] bg-accent p-5 text-accent-ink shadow-button">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium opacity-80">Prize pool</p>
          <p className="tabular text-[40px] font-bold leading-none tracking-tight">
            <span className="mr-0.5 align-top text-lg font-semibold opacity-70">$</span>
            {formatUsdc(data.prizePool)}
          </p>
        </div>
        <ol className="flex flex-wrap gap-1.5">
          {data.prizeSplitBps
            .map((bps, index) => ({ rank: index + 1, bps }))
            .map(({ rank, bps }) => (
              <li
                key={rank}
                className="tabular rounded-lg bg-white/20 px-2 py-1 font-mono text-xs font-bold"
              >
                #{rank} · {formatUsdc((data.prizePool * BigInt(bps)) / BPS)}
              </li>
            ))}
        </ol>
        <dl className="grid grid-cols-3 gap-2 border-t border-white/20 pt-4 text-[13px]">
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium opacity-80">{phase === "upcoming" ? "Starts" : "Ends"}</dt>
            <dd className="tabular font-semibold">{timeLeft(phase, data, now) || "Ended"}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium opacity-80">Traders</dt>
            <dd className="tabular font-semibold">
              {data.participantCount}/{data.maxParticipants}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium opacity-80">Min. capital</dt>
            <dd className="tabular font-semibold">${formatUsdc(data.startingCapital)}</dd>
          </div>
        </dl>
      </section>

      <TabMenu<Tab> label="Tournament sections" tabs={TABS} value={tab} onChange={setTab} />

      {tab === "Overview" ? (
        <div key="overview" className="flex animate-enter flex-col gap-3">
          <ResultsPanel tournament={data} phase={phase} now={now} />
          <JoinPanel tournament={data} phase={phase} />
          <Commentary id={id} name={tournamentName(data.id, data.metadataURI)} />
          <Card className="flex flex-col gap-2">
            <p className="text-sm font-semibold tracking-tight">How it is scored</p>
            <p className="text-sm font-medium leading-5 text-ink-muted">
              Return on the capital you joined with, from your fills on Kuru. Deposits cannot move a
              score, and anyone can recompute the table. Hosted by{" "}
              <span className="font-mono text-[13px]">{shortAddress(data.organizer)}</span>.
            </p>
          </Card>
        </div>
      ) : (
        <div key="leaderboard" className="animate-enter">
          <Leaderboard id={id} you={you} />
        </div>
      )}
    </main>
  );
}
