import type { Phase } from "@yotrade/plugin-tournament/phase";

interface Listed {
  readonly id: bigint;
  readonly participantCount: number;
  readonly prizePool: bigint;
}

/**
 * The arena's order within a tab: where the people are first, then the biggest pool, then the newest. A
 * cancelled room goes last: it is history, not an invitation. Nothing is hidden; the busy rooms simply lead.
 */
export function arenaOrder<Row extends { readonly tournament: Listed; readonly phase: Phase }>(
  rows: readonly Row[],
): Row[] {
  const cancelled = (row: Row) => (row.phase === "cancelled" ? 1 : 0);
  return [...rows].sort(
    (a, b) =>
      cancelled(a) - cancelled(b) ||
      b.tournament.participantCount - a.tournament.participantCount ||
      Number(b.tournament.prizePool - a.tournament.prizePool) ||
      Number(b.tournament.id - a.tournament.id),
  );
}
