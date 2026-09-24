"use client";

import { useQuery } from "@tanstack/react-query";

import type { LeaderboardRow } from "./leaderboard-row.ts";

/** The server's ranking, shared by the podium and the overview: one poll per page, whichever asks first. */
export function useLeaderboard(id: string) {
  return useQuery({
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
}

/**
 * My return as the board scores it, in basis points: realized and marked PnL over capital at join plus anything
 * added since. The account's own balance would count a deposit as profit. Null until I am on the board.
 */
export function useMyReturn(id: string, me: string | undefined): number | null {
  const board = useLeaderboard(id);
  const mine = board.data?.find((row) => row.participant.toLowerCase() === me?.toLowerCase());
  return mine ? mine.roiPpm / 100 : null;
}
