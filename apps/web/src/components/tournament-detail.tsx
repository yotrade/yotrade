"use client";

import { useQuery } from "@tanstack/react-query";
import { type Phase, phaseAt } from "@yotrade/plugin-tournament/phase";
import { type ReactNode, useEffect, useState } from "react";
import type { Address } from "viem";

import { formatUsdc, isPrivate, shortAddress, timeLeft, tournamentMeta } from "@/lib/format.ts";
import type { IndexedTournamentDetail } from "@/lib/indexer.ts";
import { indexer } from "@/lib/indexer-client.ts";
import { inviteFromUrl, saveInvite } from "@/lib/invite.ts";
import { roomCode, spaced } from "@/lib/room-code.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useNow } from "@/lib/use-now.ts";
import { useRuntime } from "@/lib/use-runtime.ts";
import { useChainSchedule, withChainSchedule } from "@/lib/use-schedule.ts";
import { type Venue, venueOf } from "@/lib/venue.ts";
import { Commentary } from "./commentary.tsx";
import { HostPanel } from "./host-panel.tsx";
import { InvitePanel } from "./invite-panel.tsx";
import { JoinPanel } from "./join-panel.tsx";
import { Leaderboard } from "./leaderboard.tsx";
import { LobbyList } from "./lobby-list.tsx";
import { PhaseBadge } from "./phase-badge.tsx";
import { ResultsPanel } from "./results-panel.tsx";
import { ShareButton } from "./share-button.tsx";
import { BackButton } from "./ui/back-button.tsx";
import { Card } from "./ui/card.tsx";
import { Icon } from "./ui/icon.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";
import { TournamentLogo } from "./ui/tournament-logo.tsx";

const BPS = 10_000n;

/** Every state keeps the header: a page without a way back is a dead end. */
function Shell({ title, children }: { title: string | null; children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col gap-6 pb-28 pt-4">
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

/** The game code, big enough to read out, one tap to copy. */
function RoomCodeChip({ id }: { id: bigint }) {
  const [copied, setCopied] = useState(false);
  const code = roomCode(id);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(code).catch(() => undefined);
        setCopied(true);
      }}
      aria-label={`Game code ${code}, copy`}
      className="flex shrink-0 flex-col items-end rounded-2xl bg-white/15 px-3 py-2 transition duration-200 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white active:scale-[0.97]"
    >
      <span className="text-[11px] font-semibold opacity-80">
        {copied ? "Copied" : "Game code"}
      </span>
      <span className="tabular font-mono text-lg font-bold tracking-[0.12em]">{spaced(code)}</span>
    </button>
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
  readonly leverageCap: string;
}

/** Under the card: results or the join, the host's cards, the commentator, then the table itself. */
function Overview({ id, data, phase, venue, now, you, leverageCap }: OverviewProps) {
  const running = phase === "upcoming" || phase === "live";
  return (
    <div className="flex flex-col gap-3">
      {phase === "cancelled" ? (
        <Card className="py-4 text-sm font-medium leading-5 text-ink-muted">
          The host called this tournament off before it started. Any prize pool went back to them.
        </Card>
      ) : null}
      <ResultsPanel tournament={data} phase={phase} now={now} />
      <JoinPanel tournament={data} phase={phase} />
      {running ? <InvitePanel tournament={data} /> : null}
      <HostPanel tournament={data} phase={phase} now={now} />
      {phase === "upcoming" ? (
        <LobbyList tournament={data} now={now} you={you} />
      ) : (
        <Leaderboard id={id} you={you} venue={venue} />
      )}
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
            ? `Return on a virtual $10,000, traded long or short at Pyth prices with up to ${leverageCap}${/^\d+$/.test(leverageCap) ? "x" : ""}. Positions still open at the end are closed at the first Pyth price after it, so nobody picks their exit. Hosted by `
            : "Return from your fills on Kuru, on the capital you joined with plus anything you add later, so more money buys no more return. Anyone can recompute the table. Hosted by "}
          <span className="font-mono text-[13px]">{shortAddress(data.organizer)}</span>.
        </p>
      </details>
      <Commentary id={id} />
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
  const { identity } = useIdentity();
  const you = identity?.tournamentWallet(BigInt(id)).account.address;
  const indexed = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => indexer.tournament(BigInt(id)),
    refetchInterval: 5_000,
  });
  const schedule = useChainSchedule(id);
  const { isPending, isError } = indexed;
  const data = indexed.data ? withChainSchedule(indexed.data, schedule.data) : indexed.data;
  const { perps } = useRuntime();
  const leverageCap = useQuery({
    queryKey: ["leverage-cap", id],
    queryFn: async () => (await perps.leverageCapOf(BigInt(id))).toString(),
    enabled: Boolean(data && venueOf(data.venue) === "futures"),
    staleTime: 60_000,
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

  return <Loaded id={id} data={data} now={now} you={you} leverageCap={leverageCap.data} />;
}

interface LoadedProps {
  readonly id: string;
  readonly data: IndexedTournamentDetail;
  readonly now: bigint;
  readonly you: Address | undefined;
  readonly leverageCap: string | undefined;
}

/** The page once the tournament is known: header, hero card, and the overview under it. */
function Loaded({ id, data, now, you, leverageCap: cap }: LoadedProps) {
  const leverageCap = { data: cap };
  const phase = phaseAt(data, now);
  const venue = venueOf(data.venue);
  // Futures show the cap once the chain has answered; a default number would lie for a moment.
  let thirdFact = `$${formatUsdc(data.startingCapital)}`;
  if (venue === "futures") {
    thirdFact = leverageCap.data ? `Up to ${leverageCap.data}x` : "…";
  }
  const meta = tournamentMeta(data.id, data.metadataURI);

  return (
    <main className="flex flex-1 flex-col gap-6 pb-28 pt-4">
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
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-medium opacity-80">Prize pool</p>
            <p className="tabular text-[40px] font-bold leading-none tracking-tight">
              <span className="mr-0.5 align-top text-lg font-semibold opacity-70">$</span>
              {formatUsdc(data.prizePool)}
            </p>
          </div>
          <RoomCodeChip id={data.id} />
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
              {venue === "futures" ? "Leverage" : "Min. capital"}
            </dt>
            <dd className="tabular font-semibold">{thirdFact}</dd>
          </div>
        </dl>
      </section>

      <Overview
        id={id}
        data={data}
        phase={phase}
        venue={venue}
        now={now}
        you={you}
        leverageCap={leverageCap.data ?? "the tournament's cap"}
      />
    </main>
  );
}
