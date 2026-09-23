"use client";

import type { Address } from "viem";

import type { LeaderboardRow } from "@/lib/leaderboard-row.ts";
import { useLeaderboard } from "@/lib/use-leaderboard.ts";
import { traderName, useProfiles } from "@/lib/use-profiles.ts";
import { Avatar } from "./ui/avatar.tsx";
import { Card } from "./ui/card.tsx";
import { Icon } from "./ui/icon.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";

const MEDALS = [
  "bg-[#6e54ff] text-white",
  "bg-[#85e6ff] text-ink",
  "bg-[#ffae45] text-ink",
] as const;

const roi = (ppm: number) => `${ppm >= 0 ? "+" : ""}${(ppm / 10_000).toFixed(2)}%`;

interface Props {
  readonly id: string;
  readonly you: Address | undefined;
  onSeeAll(): void;
}

/** The race, in one glance: who leads and where I stand. The full table is one tap away. */
export function StandingsPulse({ id, you, onSeeAll }: Props) {
  const { data, isPending } = useLeaderboard(id);
  const rows = data ?? [];
  const profileOf = useProfiles(rows.slice(0, 3).map((row) => row.participant));
  const mine = rows.find((row) => row.participant === you);

  if (isPending) {
    return (
      <Loading label="Loading standings">
        <Skeleton className="h-[164px] rounded-2xl" />
      </Loading>
    );
  }
  if (rows.length === 0) {
    return null;
  }

  return (
    <Card className="flex flex-col gap-3 py-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Icon name="crown" size={20} />
          Right now
        </p>
        <button
          type="button"
          onClick={onSeeAll}
          className="rounded-lg font-mono text-[13px] font-semibold text-accent hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-accent"
        >
          Full table
        </button>
      </div>
      <ol className="flex flex-col gap-2">
        {rows.slice(0, 3).map((row: LeaderboardRow, index) => (
          <li key={row.participant} className="flex items-center gap-3">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${MEDALS[index]}`}
            >
              {index + 1}
            </span>
            <Avatar
              address={row.participant}
              size={28}
              avatar={profileOf(row.participant)?.avatar}
            />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">
              {traderName(row.participant, profileOf(row.participant), row.participant === you)}
            </p>
            <p
              className={`tabular font-mono text-[13px] font-bold ${row.roiPpm >= 0 ? "text-up" : "text-down"}`}
            >
              {roi(row.roiPpm)}
            </p>
          </li>
        ))}
      </ol>
      {mine && mine.rank > 3 ? (
        <p className="text-sm font-medium text-ink-muted">
          You are <span className="font-semibold text-ink">#{mine.rank}</span> of {rows.length}
          {mine.fills === 0 ? ". Trade once to get on the board." : "."}
        </p>
      ) : (
        <p className="text-sm font-medium text-ink-muted">
          {rows.length} {rows.length === 1 ? "trader" : "traders"} in the race
        </p>
      )}
    </Card>
  );
}
