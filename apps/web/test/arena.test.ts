import { describe, expect, test } from "bun:test";

import { arenaOrder } from "@/lib/arena.ts";

const row = (id: bigint, participantCount: number, prizePool: bigint, phase = "live" as const) => ({
  tournament: { id, participantCount, prizePool },
  phase,
});

describe("arenaOrder", () => {
  test("people first, then the pool, then the newest; cancelled rooms last", () => {
    const ordered = arenaOrder([
      row(20n, 0, 0n),
      row(1n, 15, 1_000n),
      row(21n, 0, 0n),
      row(14n, 1, 0n),
      row(16n, 0, 500n),
      { tournament: { id: 12n, participantCount: 3, prizePool: 0n }, phase: "cancelled" as const },
    ]);
    expect(ordered.map((r) => r.tournament.id)).toEqual([1n, 14n, 16n, 21n, 20n, 12n]);
  });
});
