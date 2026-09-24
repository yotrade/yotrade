"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Phase, phaseAt } from "@yotrade/plugin-tournament/phase";
import { useEffect, useState } from "react";
import type { Address } from "viem";

import { describeFailure } from "@/lib/describe-failure.ts";
import { formatUsdc, isPrivate, tournamentMeta } from "@/lib/format.ts";
import { fundGas } from "@/lib/fund-gas.ts";
import type { IndexedTournamentDetail } from "@/lib/indexer.ts";
import { indexer } from "@/lib/indexer-client.ts";
import { hostInvite, inviteLink } from "@/lib/invite.ts";
import type { LeaderboardRow } from "@/lib/leaderboard-row.ts";
import { roomCode, spaced } from "@/lib/room-code.ts";
import { clock, joinUrl } from "@/lib/screen.ts";
import { formatBps } from "@/lib/ticket.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useLeaderboard } from "@/lib/use-leaderboard.ts";
import { useNow } from "@/lib/use-now.ts";
import { traderName, useProfiles } from "@/lib/use-profiles.ts";
import { useRuntime } from "@/lib/use-runtime.ts";
import { useChainSchedule, withChainSchedule } from "@/lib/use-schedule.ts";
import { Avatar } from "./ui/avatar.tsx";
import { Confetti } from "./ui/confetti.tsx";
import { QrCode } from "./ui/qr-code.tsx";

const ROW = 76;
const SHOWN = 8;
const MEDALS = ["bg-[#ffd166] text-ink", "bg-[#dfe3ea] text-ink", "bg-[#f4a261] text-ink"] as const;
const roi = (ppm: number) => formatBps(ppm / 100);

/** Where a phone goes to join. A private room's QR carries the invite when the host has it on this device. */
function useJoinTarget(tournament: IndexedTournamentDetail): string {
  const { identity } = useIdentity();
  const { tournament: manager } = useRuntime();
  const [origin, setOrigin] = useState("https://app.yotrade.xyz");
  useEffect(() => setOrigin(window.location.origin), []);
  const code = roomCode(tournament.id);
  const hosting =
    isPrivate(tournament.metadataURI) &&
    identity?.wallet.account.address.toLowerCase() === tournament.organizer.toLowerCase();
  const signer = useQuery({
    queryKey: ["invite-signer", tournament.id.toString()],
    queryFn: () => manager.inviteSignerOf(tournament.id),
    enabled: hosting,
  });
  const invite =
    hosting && identity && signer.data ? hostInvite(identity, tournament.id, signer.data) : null;
  return joinUrl(origin, code, invite ? inviteLink(origin, tournament.id, invite.code) : null);
}

function JoinPanel({ tournament }: { tournament: IndexedTournamentDetail }) {
  const target = useJoinTarget(tournament);
  const code = roomCode(tournament.id);
  const host = target.replace(/^https?:\/\//, "").split("/")[0];
  return (
    <section className="flex flex-col items-center gap-6 rounded-[36px] bg-white/5 p-8 text-center">
      <p className="text-xl font-semibold text-white/70">
        Join at <span className="text-white">{host}</span>
      </p>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">Game code</p>
        <p className="tabular whitespace-nowrap font-mono text-[clamp(40px,4.6vw,84px)] font-bold leading-none tracking-[0.08em]">
          {spaced(code)}
        </p>
      </div>
      <QrCode value={target} size={260} label={`QR code to join ${spaced(code)}`} />
      <p className="text-sm font-medium text-white/60">
        Scan with a phone camera. One passkey and you are in.
      </p>
    </section>
  );
}

function StartNow({ tournament }: { tournament: IndexedTournamentDetail }) {
  const { identity } = useIdentity();
  const { publicClient, tournament: manager } = useRuntime();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  if (identity?.wallet.account.address.toLowerCase() !== tournament.organizer.toLowerCase()) {
    return null;
  }
  async function start() {
    if (!identity) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await fundGas(publicClient, identity.wallet.account.address);
      await manager.startNow(identity.wallet, tournament.id);
      await queryClient.invalidateQueries({ queryKey: ["tournament"] });
    } catch (cause) {
      console.error("startNow failed", cause);
      setError(describeFailure(cause, "The game did not start. Try again."));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="rounded-full bg-accent px-10 py-5 font-mono text-2xl font-bold text-white shadow-button transition duration-200 hover:bg-accent-strong focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-accent active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Starting…" : "Start now"}
      </button>
      {error ? (
        <p role="alert" className="text-base font-semibold text-[#ff8a8a]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Before the start: names pop in as people join, and the clock counts down to the bell. */
function Lobby({ tournament, now }: { tournament: IndexedTournamentDetail; now: bigint }) {
  const people = tournament.entries.map((entry) => entry.participant_id as Address);
  const profileOf = useProfiles(people);
  return (
    <section className="flex flex-1 flex-col gap-8">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold text-white/60">Starts in</p>
          <p className="tabular font-mono text-[clamp(56px,8vw,120px)] font-bold leading-none">
            {clock(tournament.startTime - now)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="text-lg font-semibold text-white/60">Traders in</p>
          <p className="tabular text-[clamp(56px,8vw,120px)] font-bold leading-none">
            {people.length}
            <span className="text-white/40">/{tournament.maxParticipants}</span>
          </p>
        </div>
      </div>
      {people.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-2xl font-semibold text-white/50">
          Waiting for the first trader…
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {people.map((person) => (
            <li
              key={person}
              className="flex animate-pop items-center gap-3 rounded-full bg-white/10 py-2 pl-2 pr-4"
            >
              <Avatar address={person} size={40} avatar={profileOf(person)?.avatar} />
              <span className="truncate text-lg font-semibold">
                {traderName(person, profileOf(person), false)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-center">
        <StartNow tournament={tournament} />
      </div>
    </section>
  );
}

/** While it runs: the top of the table, rows sliding to their new places as the ranks change. */
function Race({
  id,
  tournament,
  now,
}: {
  id: string;
  tournament: IndexedTournamentDetail;
  now: bigint;
}) {
  const { data } = useLeaderboard(id);
  const rows = (data ?? []).slice(0, SHOWN);
  const profileOf = useProfiles(rows.map((row) => row.participant));
  return (
    <section className="flex flex-1 flex-col gap-6">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold text-white/60">Time left</p>
          <p className="tabular font-mono text-[clamp(56px,8vw,120px)] font-bold leading-none">
            {clock(tournament.endTime - now)}
          </p>
        </div>
        <p className="tabular text-right text-2xl font-semibold text-white/60">
          {tournament.participantCount} traders
        </p>
      </div>
      <ol className="relative" style={{ height: Math.max(rows.length, 1) * ROW }}>
        {rows.map((row: LeaderboardRow, index) => (
          <li
            key={row.participant}
            className="absolute inset-x-0 flex items-center gap-4 rounded-3xl bg-white/5 px-4 transition-[top] duration-700 ease-out"
            style={{ top: index * ROW, height: ROW - 8 }}
          >
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-full font-mono text-lg font-bold ${MEDALS[index] ?? "bg-white/10 text-white"}`}
            >
              {index + 1}
            </span>
            <Avatar
              address={row.participant}
              size={44}
              avatar={profileOf(row.participant)?.avatar}
            />
            <span className="min-w-0 flex-1 truncate text-2xl font-semibold">
              {traderName(row.participant, profileOf(row.participant), false)}
            </span>
            <span
              className={`tabular font-mono text-2xl font-bold ${row.roiPpm >= 0 ? "text-[#7ce7a3]" : "text-[#ff8a8a]"}`}
            >
              {roi(row.roiPpm)}
            </span>
          </li>
        ))}
      </ol>
      {rows.length === 0 ? (
        <p className="text-2xl font-semibold text-white/50">The first trade takes the lead.</p>
      ) : null}
    </section>
  );
}

/** After the bell: three steps, the winners on them, and the pool they split. */
function Podium({ id, tournament }: { id: string; tournament: IndexedTournamentDetail }) {
  const { data } = useLeaderboard(id);
  const top = (data ?? []).slice(0, 3);
  const profileOf = useProfiles(top.map((row) => row.participant));
  const order = [1, 0, 2].filter((index) => top[index]);
  const heights = ["h-56", "h-40", "h-32"];
  return (
    <section className="flex flex-1 flex-col items-center justify-end gap-8">
      <Confetti />
      <p className="text-3xl font-bold">Final standings</p>
      <div className="flex w-full max-w-3xl items-end justify-center gap-4">
        {order.map((index) => {
          const row = top[index];
          if (!row) {
            return null;
          }
          return (
            <div
              key={row.participant}
              className="flex w-full max-w-60 flex-1 animate-pop flex-col items-center gap-3"
            >
              <Avatar
                address={row.participant}
                size={88}
                avatar={profileOf(row.participant)?.avatar}
              />
              <p className="max-w-full truncate text-2xl font-bold">
                {traderName(row.participant, profileOf(row.participant), false)}
              </p>
              <p
                className={`tabular font-mono text-xl font-bold ${row.roiPpm >= 0 ? "text-[#7ce7a3]" : "text-[#ff8a8a]"}`}
              >
                {roi(row.roiPpm)}
              </p>
              <div
                className={`flex w-full items-start justify-center rounded-t-3xl pt-4 ${heights[index]} ${MEDALS[index]}`}
              >
                <span className="font-mono text-5xl font-bold">{index + 1}</span>
              </div>
            </div>
          );
        })}
      </div>
      {tournament.prizePool > 0n ? (
        <p className="text-xl font-semibold text-white/70">
          ${formatUsdc(tournament.prizePool)} paid by the contract
        </p>
      ) : null}
    </section>
  );
}

function Stage({
  id,
  tournament,
  phase,
  now,
}: {
  id: string;
  tournament: IndexedTournamentDetail;
  phase: Phase;
  now: bigint;
}) {
  if (phase === "upcoming") {
    return <Lobby tournament={tournament} now={now} />;
  }
  if (phase === "live") {
    return <Race id={id} tournament={tournament} now={now} />;
  }
  if (phase === "cancelled") {
    return <p className="text-3xl font-semibold text-white/70">This game was called off.</p>;
  }
  return <Podium id={id} tournament={tournament} />;
}

/** The projector view: join instructions on one side, the game on the other. Built to be read across a room. */
export function HostScreen({ id }: { id: string }) {
  const now = useNow();
  const indexed = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => indexer.tournament(BigInt(id)),
    refetchInterval: 3_000,
  });
  const schedule = useChainSchedule(id);
  const data = indexed.data ? withChainSchedule(indexed.data, schedule.data) : indexed.data;
  const commentary = useQuery({
    queryKey: ["commentary", id, "en"],
    queryFn: async () => {
      const response = await fetch(`/api/commentary/${id}?lang=en`);
      return response.ok ? ((await response.json()) as { text: string | null }).text : null;
    },
    refetchInterval: 60_000,
    enabled: data !== undefined && data !== null,
  });

  if (!data) {
    return (
      <main className="fixed inset-0 z-50 grid place-items-center bg-ink text-white">
        <p className="text-2xl font-semibold text-white/60">
          {data === null ? "No such game." : "Loading the game…"}
        </p>
      </main>
    );
  }
  const phase = phaseAt(data, now);
  const meta = tournamentMeta(data.id, data.metadataURI);
  const joining = phase === "upcoming" || phase === "live";
  return (
    <main className="fixed inset-0 z-50 overflow-y-auto bg-ink text-white">
      <div className="mx-auto flex min-h-full max-w-[1600px] flex-col gap-8 p-[clamp(20px,3vw,48px)]">
        <header className="flex items-center justify-between gap-6">
          <h1 className="truncate text-[clamp(28px,3.5vw,52px)] font-bold tracking-tight">
            {meta.name}
          </h1>
          <p className="tabular shrink-0 text-2xl font-semibold text-white/70">
            {data.prizePool > 0n ? `$${formatUsdc(data.prizePool)} prize` : "For bragging rights"}
          </p>
        </header>
        <div
          className={`grid flex-1 gap-8 ${joining ? "lg:grid-cols-[minmax(320px,440px)_1fr]" : ""}`}
        >
          {joining ? <JoinPanel tournament={data} /> : null}
          <Stage id={id} tournament={data} phase={phase} now={now} />
        </div>
        {commentary.data ? (
          <footer className="rounded-3xl bg-white/5 px-6 py-4 text-xl font-medium leading-relaxed text-white/80">
            <span className="mr-2 font-semibold text-white">Kimi</span>
            {commentary.data}
          </footer>
        ) : null}
      </div>
    </main>
  );
}
