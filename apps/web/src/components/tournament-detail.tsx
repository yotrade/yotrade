"use client";

import { useQuery } from "@tanstack/react-query";
import { type Phase, phaseAt } from "@yotrade/plugin-tournament/phase";
import { type ReactNode, useEffect, useState } from "react";
import type { Address } from "viem";

import {
  formatUsdc,
  isPrivate,
  shortAddress,
  timeLeft,
  tournamentMeta,
  tournamentName,
} from "@/lib/format.ts";
import type { IndexedTournamentDetail } from "@/lib/indexer.ts";
import { indexer } from "@/lib/indexer-client.ts";
import { inviteFromUrl, saveInvite } from "@/lib/invite.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useNow } from "@/lib/use-now.ts";
import { type Venue, venueOf } from "@/lib/venue.ts";
import { Commentary } from "./commentary.tsx";
import { HostPanel } from "./host-panel.tsx";
import { InvitePanel } from "./invite-panel.tsx";
import { JoinPanel } from "./join-panel.tsx";
import { Leaderboard } from "./leaderboard.tsx";
import { MarketsStrip } from "./markets-strip.tsx";
import { PhaseBadge } from "./phase-badge.tsx";
import { ResultsPanel } from "./results-panel.tsx";
import { ShareButton } from "./share-button.tsx";
import { StandingsPulse } from "./standings-pulse.tsx";
import { BackButton } from "./ui/back-button.tsx";
import { Card } from "./ui/card.tsx";
import { Icon } from "./ui/icon.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";
import { TabMenu } from "./ui/tab-menu.tsx";
import { TournamentLogo } from "./ui/tournament-logo.tsx";

const BPS = 10_000n;
const TABS = ["Overview", "Leaderboard"] as const;
type Tab = (typeof TABS)[number];

/** Every state keeps the header: a page without a way back is a dead end. */
function Shell({ title, children }: { title: string | null; children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col gap-6 pb-10 pt-4">
      <header className="flex items-center gap-3">
        <BackButton />
        {title === null ? (
          <Skeleton className="h-6 w-40" />
        ) : (
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold leading-[26px] tracking-tight">
            {title}
          </h1>
        )}
      </header>
      {children}
    </main>
  );
}

/** Who gets what, or a note that this one is for the fun of it. */
function PrizeSplit({ pool, splitBps }: { pool: bigint; splitBps: readonly number[] }) {
  const data = { prizePool: pool, prizeSplitBps: splitBps };
  return (
    <>
      {data.prizePool > 0n ? (
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
      ) : (
        <p className="text-[13px] font-medium opacity-80">
          A friendly: no prize pool, bragging rights only.
        </p>
      )}
    </>
  );
}

interface OverviewProps {
  readonly id: string;
  readonly data: IndexedTournamentDetail;
  readonly phase: Phase;
  readonly venue: Venue;
  readonly now: bigint;
  readonly you: Address | undefined;
  onSeeAll(): void;
}

/** The overview tab: results or the race, my status, the host's invite, the markets, the commentator. */
function Overview({ id, data, phase, venue, now, you, onSeeAll }: OverviewProps) {
  const running = phase === "upcoming" || phase === "live";
  return (
    <div key="overview" className="flex animate-enter flex-col gap-3">
      {phase === "cancelled" ? (
        <Card className="py-4 text-sm font-medium leading-5 text-ink-muted">
          The host called this tournament off before it started. Any prize pool went back to them.
        </Card>
      ) : null}
      <ResultsPanel tournament={data} phase={phase} now={now} />
      <JoinPanel tournament={data} phase={phase} />
      {phase === "live" || phase === "scoring" || phase === "dispute" ? (
        <StandingsPulse id={id} you={you} onSeeAll={onSeeAll} />
      ) : null}
      {running ? <InvitePanel tournament={data} /> : null}
      <HostPanel tournament={data} phase={phase} now={now} />
      {running ? <MarketsStrip id={id} venue={venue} /> : null}
      <Commentary id={id} name={tournamentName(data.id, data.metadataURI)} />
      <details className="group rounded-2xl bg-surface-raised px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
          How it is scored
          <Icon
            name="chevron-right"
            size={14}
            className="transition-transform group-open:rotate-90"
          />
        </summary>
        <p className="pt-2 text-sm font-medium leading-5 text-ink-muted">
          {venue === "futures"
            ? "Return on a virtual $10,000, traded long or short at Pyth prices with up to 20x. Positions still open at the end are closed at the first Pyth price after it, so nobody picks their exit. Hosted by "
            : "Return on the capital you joined with, from your fills on Kuru. Deposits cannot move a score, and anyone can recompute the table. Hosted by "}
          <span className="font-mono text-[13px]">{shortAddress(data.organizer)}</span>.
        </p>
      </details>
    </div>
  );
}

export function TournamentDetail({ id }: { id: string }) {
  const now = useNow();
  // An invite arrives in the fragment. Kept on this device so the join works after any reload.
  useEffect(() => {
    const code = inviteFromUrl(window.location.hash);
    if (code) {
      saveInvite(BigInt(id), code);
    }
  }, [id]);
  const [tab, setTab] = useState<Tab>("Overview");
  const { identity } = useIdentity();
  const you = identity?.tournamentWallet(BigInt(id)).account.address;
  const { data, isPending, isError } = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => indexer.tournament(BigInt(id)),
    refetchInterval: 5_000,
  });

  if (isPending) {
    return (
      <Shell title={null}>
        <Loading label="Loading tournament" className="flex flex-col gap-6">
          <Skeleton className="h-[236px] rounded-[28px]" />
          <Skeleton className="h-10 rounded-full" />
          <Skeleton className="h-[72px] rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </Loading>
      </Shell>
    );
  }
  if (isError) {
    return (
      <Shell title={`Tournament #${id}`}>
        <p role="alert" className="text-sm font-medium text-down">
          This tournament could not be loaded. Retrying…
        </p>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell title={`Tournament #${id}`}>
        <p className="text-sm font-medium text-ink-muted">
          This tournament was not found. If you just created it, it appears here within seconds.
        </p>
      </Shell>
    );
  }

  const phase = phaseAt(data, now);
  const venue = venueOf(data.venue);
  const meta = tournamentMeta(data.id, data.metadataURI);

  return (
    <main className="flex flex-1 flex-col gap-6 pb-10 pt-4">
      <header className="flex items-center gap-3">
        <BackButton />
        {meta.image ? <TournamentLogo image={meta.image} size={36} /> : null}
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold leading-[26px] tracking-tight">
          {meta.name}
        </h1>
        <span className="rounded-lg bg-surface-raised px-2 py-1 font-mono text-[11px] font-bold uppercase text-ink-muted">
          {isPrivate(data.metadataURI) ? "private" : venue}
        </span>
        <PhaseBadge phase={phase} />
        {/* A private link carries the invite code, which the host's card shares; this one is for public ones. */}
        {isPrivate(data.metadataURI) ? null : <ShareButton title={meta.name} />}
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
        <PrizeSplit pool={data.prizePool} splitBps={data.prizeSplitBps} />
        <dl className="grid grid-cols-3 gap-2 border-t border-white/20 pt-4 text-[13px]">
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium opacity-80">{phase === "upcoming" ? "Starts" : "Ends"}</dt>
            <dd className="tabular font-semibold">
              {phase === "cancelled" ? "Called off" : timeLeft(phase, data, now) || "Ended"}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium opacity-80">Traders</dt>
            <dd className="tabular font-semibold">
              {data.participantCount}/{data.maxParticipants}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium opacity-80">
              {venue === "futures" ? "Start balance" : "Min. capital"}
            </dt>
            <dd className="tabular font-semibold">
              {venue === "futures" ? "$10,000" : `$${formatUsdc(data.startingCapital)}`}
            </dd>
          </div>
        </dl>
      </section>

      <TabMenu<Tab> label="Tournament sections" tabs={TABS} value={tab} onChange={setTab} />

      {tab === "Overview" ? (
        <Overview
          id={id}
          data={data}
          phase={phase}
          venue={venue}
          now={now}
          you={you}
          onSeeAll={() => setTab("Leaderboard")}
        />
      ) : (
        <div key="leaderboard" className="animate-enter">
          <Leaderboard id={id} you={you} venue={venue} />
        </div>
      )}
    </main>
  );
}
