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
  /** Entrants on-chain. The board lists the indexer's, which can trail a join made just before the end. */
  participants?(id: bigint): Promise<number>;
  now?: () => number;
}

/** The indexer has not seen every join yet: a ranking now would leave someone out for good. */
export class IndexerBehindError extends Error {
  override readonly name = "IndexerBehindError";
}

/**
 * Anyone may ask for a tournament to be finalized. The caller supplies only the id: the winners are computed
 * here from public data, so the trigger carries no authority.
 */
export function createFinalizer({
  leaderboard,
  postResults,
  settle,
  participants,
  now = Date.now,
}: FinalizeDeps) {
  const inFlight = new Map<string, Promise<FinalizeResult>>();
  // Every transaction comes from the one scorer wallet, and Monad's pending nonce lags: one run at a time.
  let queue: Promise<unknown> = Promise.resolve();

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
    if (participants && (await participants(id)) > board.rows.length) {
      throw new IndexerBehindError(`Tournament ${id} has entries the indexer has not seen yet`);
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
    const next = queue.then(() => run(id)).finally(() => inFlight.delete(key));
    queue = next.catch(() => undefined);
    inFlight.set(key, next);
    return next;
  };
}
