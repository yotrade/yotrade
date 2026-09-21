"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { formatUsdc, shortAddress } from "@/lib/format.ts";
import type { LeaderboardRow } from "@/lib/leaderboard-row.ts";
import { Avatar } from "./ui/avatar.tsx";
import { Card } from "./ui/card.tsx";

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

  if (isPending) {
    return <p className="text-sm text-ink-muted">Scoring traders…</p>;
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
  return (
    <ol className="flex flex-col gap-1">
      {data.map((row, index) => (
        <li
          key={row.participant}
          className="animate-enter"
          style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
        >
          <Card
            className={`flex items-center gap-3 ${row.participant === you ? "bg-accent-soft/50" : ""}`}
          >
            <span className="tabular w-5 text-center font-mono text-sm font-bold text-ink-muted">
              {row.rank}
            </span>
            <Avatar address={row.participant} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate font-semibold leading-tight">
                {shortAddress(row.participant)}
                {row.participant === you ? (
                  <span className="ml-2 rounded-lg bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-accent-ink">
                    You
                  </span>
                ) : null}
              </p>
              <p className="tabular text-sm font-medium text-ink-muted">
                {formatPnl(row.pnl)} USDC · {row.fills} fills
              </p>
            </div>
            <span
              className={`tabular text-right text-base font-bold ${row.roiPpm >= 0 ? "text-up" : "text-down"}`}
            >
              {formatRoi(row.roiPpm)}
            </span>
          </Card>
        </li>
      ))}
    </ol>
  );
}
