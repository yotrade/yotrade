"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { formatUsdc } from "@/lib/format.ts";
import type { LeaderboardRow } from "@/lib/leaderboard-row.ts";
import { traderName, useProfiles } from "@/lib/use-profiles.ts";
import { Podium } from "./podium.tsx";
import { Avatar } from "./ui/avatar.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";

function formatRoi(ppm: number): string {
  return `${ppm >= 0 ? "+" : ""}${(ppm / 10_000).toFixed(2)}%`;
}

function formatPnl(raw: string): string {
  const pnl = BigInt(raw);
  return `${pnl < 0n ? "−" : "+"}${formatUsdc(pnl < 0n ? -pnl : pnl)}`;
}

export function Leaderboard({ id, you }: { id: string; you: Address | undefined }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["leaderboard", id],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const response = await fetch(`/api/leaderboard/${id}`);
      if (!response.ok) {
        throw new Error(`Leaderboard answered ${response.status}`);
      }
      return ((await response.json()) as { rows: LeaderboardRow[] }).rows;
    },
    refetchInterval: 5_000,
  });
  const profileOf = useProfiles((data ?? []).map((row) => row.participant));
  const nameOf = (row: LeaderboardRow) =>
    traderName(row.participant, profileOf(row.participant), row.participant === you);

  if (isPending) {
    return (
      <Loading label="Scoring traders" className="flex flex-col gap-4">
        <div className="flex items-end justify-center gap-3 px-2">
          <Skeleton className="h-40 flex-1 rounded-t-3xl" />
          <Skeleton className="h-56 flex-1 rounded-t-3xl" />
          <Skeleton className="h-36 flex-1 rounded-t-3xl" />
        </div>
        <Skeleton className="h-[60px] rounded-full" />
        <Skeleton className="h-[60px] rounded-full" />
      </Loading>
    );
  }
  if (isError) {
    return (
      <p role="alert" className="text-sm text-down">
        Scores are unavailable right now. Retrying…
      </p>
    );
  }
  if (data.length === 0) {
    return <p className="text-sm text-ink-muted">Nobody has joined yet.</p>;
  }
  const rest = data.slice(3);
  return (
    <div className="flex flex-col">
      <Podium
        entries={data.slice(0, 3).map((row) => ({
          address: row.participant,
          name: nameOf(row),
          avatar: profileOf(row.participant)?.avatar,
          score: formatRoi(row.roiPpm),
          you: row.participant === you,
        }))}
      />
      {/* The panel under the podium: everyone from fourth place down. */}
      <ol className="-mt-2 flex flex-col gap-2 rounded-[32px] bg-surface p-2 shadow-[0_-8px_24px_#0e091c0f]">
        {data.slice(0, 3).map((row) => (
          <li key={row.participant} className="sr-only">
            {row.rank}. {nameOf(row)} {formatRoi(row.roiPpm)}
          </li>
        ))}
        {rest.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm font-medium text-ink-muted">
            {data.length < 3 ? "Room on the podium: invite more traders." : "Nobody else yet."}
          </li>
        ) : null}
        {rest.map((row, index) => (
          <li
            key={row.participant}
            className="flex animate-enter items-center gap-3 rounded-full bg-surface-raised py-2 pl-2 pr-3"
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
          >
            <Avatar
              address={row.participant}
              size={44}
              avatar={profileOf(row.participant)?.avatar}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate font-semibold leading-tight">
                <span className="tabular mr-1.5 font-mono text-xs text-ink-muted">{row.rank}</span>
                {nameOf(row)}
              </p>
              <p className="tabular truncate text-[13px] font-medium text-ink-muted">
                {formatPnl(row.pnl)} USDC · {row.fills} fills
              </p>
            </div>
            <span
              className={`tabular flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-xs font-bold ${row.roiPpm >= 0 ? "bg-up/10 text-up" : "bg-down/10 text-down"}`}
            >
              {formatRoi(row.roiPpm)}
              <span aria-hidden className={row.roiPpm >= 0 ? "" : "rotate-180"}>
                ▲
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
