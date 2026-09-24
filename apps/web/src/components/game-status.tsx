"use client";

import { useQuery } from "@tanstack/react-query";
import { phaseAt } from "@yotrade/plugin-tournament/phase";
import type { Address } from "viem";

import { rankLabel, rankText, returnTone, timeText } from "@/lib/game-status.ts";
import { indexer } from "@/lib/indexer-client.ts";
import { formatBps } from "@/lib/ticket.ts";
import { useLeaderboard } from "@/lib/use-leaderboard.ts";
import { useNow } from "@/lib/use-now.ts";
import { useChainSchedule, withChainSchedule } from "@/lib/use-schedule.ts";

/**
 * The game, always in view on the trade screens: where you stand, how long is left, how you are doing. The
 * three facts a player checks between trades, in the dark strip the Trade bar uses.
 */
export function GameStatus({
  id,
  you,
  returnBps,
}: {
  id: string;
  you: Address | undefined;
  returnBps: number | null;
}) {
  const now = useNow();
  const indexed = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => indexer.tournament(BigInt(id)),
    refetchInterval: 5_000,
  });
  const schedule = useChainSchedule(id);
  const board = useLeaderboard(id);
  const tournament = indexed.data ? withChainSchedule(indexed.data, schedule.data) : null;
  const phase = tournament ? phaseAt(tournament, now) : "unknown";
  const rows = board.data ?? [];
  const mine = rows.find((row) => row.participant.toLowerCase() === you?.toLowerCase());
  // The board's own number when I am on it, so the return always matches the rank next to it.
  const shownBps = mine ? mine.roiPpm / 100 : returnBps;

  return (
    <section
      aria-label="Your game"
      className="grid grid-cols-3 divide-x divide-white/15 rounded-3xl bg-ink px-2 py-4 text-white shadow-[0_8px_24px_#0e091c33]"
    >
      <Fact label={rankLabel(mine, rows.length)} value={rankText(mine)} />
      <Fact
        label={phase === "upcoming" ? "Starts" : "Time left"}
        value={timeText(phase, tournament, now)}
      />
      <Fact
        label="Return"
        value={shownBps === null ? "—" : formatBps(shownBps)}
        tone={returnTone(shownBps)}
      />
    </section>
  );
}

function Fact({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 px-2 text-center">
      <p className="w-full truncate text-[11px] font-semibold uppercase tracking-wider text-white/60">
        {label}
      </p>
      <p className={`tabular w-full truncate font-mono text-lg font-bold ${tone}`}>{value}</p>
    </div>
  );
}
