import { describe, expect, test } from "bun:test";

import { hostAction, hostedBy, RESULTS_GRACE } from "@/lib/host.ts";

const entry = (rank: number | null, prize: bigint, claimed = false) =>
  ({ rank, prize, claimed }) as never;
const base = {
  prizePool: 100_000_000n,
  endTime: 2_000n,
  now: 1_000n,
  unpaid: 100_000_000n,
  entries: [],
};

describe("hostAction mirrors the escrow module", () => {
  test("cancel until the start, nothing while live", () => {
    expect(hostAction({ ...base, phase: "upcoming" })).toEqual({
      action: "cancel",
      amount: 100_000_000n,
    });
    expect(hostAction({ ...base, phase: "live" })).toBeNull();
  });

  test("reclaim only once results are seven days overdue", () => {
    expect(hostAction({ ...base, phase: "scoring", now: 2_000n + RESULTS_GRACE - 1n })).toBeNull();
    expect(hostAction({ ...base, phase: "scoring", now: 2_000n + RESULTS_GRACE })).toEqual({
      action: "reclaim",
      amount: 100_000_000n,
    });
  });

  test("sweep what no winner can claim, never what one still can", () => {
    const entries = [entry(1, 50_000_000n), entry(2, 30_000_000n, true), entry(null, 0n)];
    // Second place already took 30, first place is still owed 50, so 20 of the 70 left is nobody's.
    expect(hostAction({ ...base, phase: "claimable", unpaid: 70_000_000n, entries })).toEqual({
      action: "sweep",
      amount: 20_000_000n,
    });
    expect(hostAction({ ...base, phase: "claimable", unpaid: 50_000_000n, entries })).toBeNull();
  });

  test("a free tournament can still be cancelled, but has nothing to reclaim or sweep", () => {
    const free = { ...base, prizePool: 0n, unpaid: 0n };
    expect(hostAction({ ...free, phase: "upcoming" })).toEqual({ action: "cancel", amount: 0n });
    expect(hostAction({ ...free, phase: "scoring", now: 2_000n + RESULTS_GRACE })).toBeNull();
    expect(hostAction({ ...free, phase: "claimable" })).toBeNull();
  });
});

describe("hostedBy", () => {
  const me = "0x000000000000000000000000000000000000AbCd" as const;
  const tournament = (id: bigint, organizer: string, status = "open") =>
    ({ id, organizer, status, startTime: 100n, endTime: 200n, claimableAt: 0n }) as never;

  test("mine, case-insensitively, newest first, cancelled left out", () => {
    const rows = hostedBy(
      [
        tournament(1n, me.toLowerCase()),
        tournament(2n, "0x0000000000000000000000000000000000000001"),
        tournament(3n, me),
        tournament(4n, me, "cancelled"),
      ],
      me,
      150n,
    );
    expect(rows.map((row) => [row.tournament.id, row.phase])).toEqual([
      [3n, "live"],
      [1n, "live"],
    ]);
  });

  test("what still runs comes before what is over", () => {
    const over = (id: bigint) =>
      ({
        id,
        organizer: me,
        status: "open",
        startTime: 10n,
        endTime: 20n,
        claimableAt: 0n,
      }) as never;
    const rows = hostedBy([over(9n), tournament(2n, me), over(8n)], me, 150n);
    expect(rows.map((row) => row.tournament.id)).toEqual([2n, 9n, 8n]);
  });
});
