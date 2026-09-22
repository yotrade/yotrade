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
