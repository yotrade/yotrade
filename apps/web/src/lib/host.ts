import { type Phase, phaseAt } from "@yotrade/plugin-tournament/phase";
import { type Address, isAddressEqual } from "viem";

import type { IndexedEntry, IndexedTournament } from "./indexer.ts";

/** `RESULTS_GRACE` in the contract: how long after the end the organizer waits before taking the pool back. */
export const RESULTS_GRACE = 7n * 86_400n;

export type HostAction = "cancel" | "reclaim" | "sweep";

/** What the pool still owes to winners who have not claimed. */
export function owedToWinners(entries: readonly IndexedEntry[]): bigint {
  return entries.reduce((sum, entry) => (entry.rank && !entry.claimed ? sum + entry.prize : sum), 0n);
}

/**
 * The one action the contract would accept from the organizer right now, or null. Mirrors `EscrowModule`:
 * cancel until the start, reclaim once results are seven days overdue, sweep the unowed remainder once
 * prizes are claimable.
 */
export function hostAction(input: {
  readonly phase: Phase;
  readonly prizePool: bigint;
  readonly endTime: bigint;
  readonly now: bigint;
  /** What the contract still holds for this tournament. */
  readonly unpaid: bigint;
  readonly entries: readonly IndexedEntry[];
}): { action: HostAction; amount: bigint } | null {
  const { phase, prizePool, endTime, now, unpaid, entries } = input;
  if (phase === "upcoming") {
    return { action: "cancel", amount: unpaid };
  }
  if (prizePool === 0n) {
    return null;
  }
  if (phase === "scoring" && now >= endTime + RESULTS_GRACE) {
    return { action: "reclaim", amount: unpaid };
  }
  if (phase === "claimable") {
    const amount = unpaid - owedToWinners(entries);
    return amount > 0n ? { action: "sweep", amount } : null;
  }
  return null;
}

/** What `organizer` still has a hand in, newest first: everything they created that was not called off. */
export function hostedBy(
  tournaments: readonly IndexedTournament[],
  organizer: Address,
  now: bigint,
): { tournament: IndexedTournament; phase: Phase }[] {
  return tournaments
    .filter((tournament) => isAddressEqual(tournament.organizer, organizer))
    .map((tournament) => ({ tournament, phase: phaseAt(tournament, now) }))
    .filter(({ phase }) => phase !== "cancelled")
    .sort((a, b) => Number(b.tournament.id - a.tournament.id));
}
