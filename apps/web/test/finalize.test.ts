import { describe, expect, test } from "bun:test";

import { createFinalizer } from "../src/server/finalize.ts";
import type { Leaderboard } from "../src/server/leaderboard.ts";

const HASH = "0x01" as const;
const row = (participant: string, roiPpm: number, fills: number) =>
  ({
    participant,
    tradingAccount: participant,
    joinedAt: 1n,
    capitalAtJoin: 1n,
    pnl: 0n,
    roiPpm,
    fills,
  }) as never;

function board(status: string, endTime: bigint): Leaderboard {
  return {
    tournament: { status, endTime, prizeSplitBps: [6_000, 4_000] } as never,
    rows: [row("0xa", 500, 3), row("0xidle", 0, 0), row("0xb", -200, 1), row("0xc", -900, 2)],
    computedAt: 0,
  };
}

function setup(current: Leaderboard | null, nowSeconds = 1_000) {
  const posted: [bigint, readonly string[]][] = [];
  const finalize = createFinalizer({
    leaderboard: () => Promise.resolve(current),
    postResults: (id, winners) => {
      posted.push([id, winners]);
      return Promise.resolve(HASH);
    },
    now: () => nowSeconds * 1000,
  });
  return { finalize, posted };
}

describe("createFinalizer", () => {
  test("posts the top traders with fills, as many as there are prize ranks", async () => {
    const { finalize, posted } = setup(board("open", 900n));
    expect(await finalize(7n)).toEqual({
      status: "posted",
      hash: HASH,
      winners: ["0xa", "0xb"] as never,
    });
    expect(posted).toEqual([[7n, ["0xa", "0xb"]]]);
  });

  test("refuses before the end, after results exist, and for unknown tournaments", async () => {
    expect((await setup(board("open", 2_000n)).finalize(1n)).status).toBe("not-ended");
    expect((await setup(board("resultsPosted", 900n)).finalize(1n)).status).toBe("already-final");
    expect((await setup(board("cancelled", 900n)).finalize(1n)).status).toBe("already-final");
    expect((await setup(null).finalize(1n)).status).toBe("unknown");
  });

  test("concurrent triggers share one transaction", async () => {
    const { finalize, posted } = setup(board("open", 900n));
    await Promise.all([finalize(7n), finalize(7n), finalize(7n)]);
    expect(posted).toHaveLength(1);
  });
});
