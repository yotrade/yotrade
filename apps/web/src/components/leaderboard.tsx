"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { formatUsdc, shortAddress } from "@/lib/format.ts";
import type { LeaderboardRow } from "@/lib/leaderboard-row.ts";
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
    <ol className="flex flex-col gap-2">
      {data.map((row) => (
        <li key={row.participant}>
          <Card
            className={`flex items-center gap-3 py-3 ${row.participant === you ? "border-accent" : ""}`}
          >
            <span className="tabular w-6 text-center font-bold text-ink-muted">{row.rank}</span>
            <span className="flex-1 truncate font-mono text-sm">
              {shortAddress(row.participant)}
              {row.participant === you ? (
                <span className="ml-2 font-sans text-accent">You</span>
              ) : null}
            </span>
            <span className="tabular text-right text-sm text-ink-muted">{formatPnl(row.pnl)}</span>
            <span
              className={`tabular w-20 text-right font-semibold ${row.roiPpm >= 0 ? "text-up" : "text-down"}`}
            >
              {formatRoi(row.roiPpm)}
            </span>
          </Card>
        </li>
      ))}
    </ol>
  );
}
