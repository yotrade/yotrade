import type { Address, Hash } from "viem";

import type { Leaderboard } from "./leaderboard.ts";
import { winnersOf } from "./scoring.ts";

export type FinalizeResult =
  | { readonly status: "posted"; readonly hash: Hash; readonly winners: Address[] }
  | { readonly status: "not-ended" | "already-final" | "unknown" };

export interface FinalizeDeps {
  leaderboard(id: bigint): Promise<Leaderboard | null>;
  postResults(id: bigint, winners: readonly Address[]): Promise<Hash>;
  /**
   * Makes the venue's own record final before winners are named. Futures close open positions at the end
   * price here, so the posted ranking can be recomputed from the chain alone. Spot has nothing to do.
   */
  settle?(board: Leaderboard): Promise<void>;
  now?: () => number;
}

/**
 * Anyone may ask for a tournament to be finalized. The caller supplies only the id: the winners are computed
 * here from public data, so the trigger carries no authority.
 */
export function createFinalizer({
  leaderboard,
  postResults,
  settle,
  now = Date.now,
}: FinalizeDeps) {
  const inFlight = new Map<string, Promise<FinalizeResult>>();

  async function run(id: bigint): Promise<FinalizeResult> {
    const board = await leaderboard(id);
    if (!board) {
      return { status: "unknown" };
    }
    const { tournament } = board;
    if (tournament.status !== "open") {
      return { status: "already-final" };
    }
    if (BigInt(Math.floor(now() / 1000)) < tournament.endTime) {
      return { status: "not-ended" };
    }
    // The board already scores at the end prices, so settling changes the chain and not the ranking.
    await settle?.(board);
    const winners = winnersOf(board.rows, tournament.prizeSplitBps.length);
    return { status: "posted", hash: await postResults(id, winners), winners };
  }

  return function finalize(id: bigint): Promise<FinalizeResult> {
    const key = id.toString();
    const running = inFlight.get(key);
    if (running) {
      return running;
    }
    const next = run(id).finally(() => inFlight.delete(key));
    inFlight.set(key, next);
    return next;
  };
}
