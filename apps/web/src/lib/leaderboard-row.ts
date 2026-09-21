import type { Address } from "viem";

/** Wire format of `GET /api/leaderboard/[id]`: bigints travel as decimal strings. */
export interface LeaderboardRow {
  readonly rank: number;
  readonly participant: Address;
  readonly pnl: string;
  readonly roiPpm: number;
  readonly fills: number;
}
