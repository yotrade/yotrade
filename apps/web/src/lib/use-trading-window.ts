"use client";

import { useQuery } from "@tanstack/react-query";
import { type Phase, phaseAt } from "@yotrade/plugin-tournament/phase";

import { timeLeft } from "./format.ts";
import { indexer } from "./indexer-client.ts";
import { useNow } from "./use-now.ts";

/** The tournament's phase as the trade screens need it. Shares the tournament page's query. */
export function useTradingWindow(id: string): { phase: Phase; opensIn: string } {
  const now = useNow();
  const { data } = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => indexer.tournament(BigInt(id)),
    refetchInterval: 5_000,
  });
  if (!data) {
    return { phase: "unknown", opensIn: "" };
  }
  const phase = phaseAt(data, now);
  return { phase, opensIn: phase === "upcoming" ? timeLeft(phase, data, now) : "" };
}
