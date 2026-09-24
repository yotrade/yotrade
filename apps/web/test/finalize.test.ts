import { describe, expect, test } from "bun:test";

import { createFinalizer, IndexerBehindError } from "../src/server/finalize.ts";
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

  test("settles the venue before naming winners, and posts nothing when settling fails", async () => {
    const order: string[] = [];
    const deps = {
      leaderboard: () => Promise.resolve(board("open", 900n)),
      postResults: () => {
        order.push("post");
        return Promise.resolve(HASH);
      },
      now: () => 1_000_000,
    };
    await createFinalizer({ ...deps, settle: () => Promise.resolve(void order.push("settle")) })(
      7n,
    );
    expect(order).toEqual(["settle", "post"]);

    order.length = 0;
    const failing = createFinalizer({
      ...deps,
      settle: () => Promise.reject(new Error("no price")),
    });
    await expect(failing(7n)).rejects.toThrow("no price");
    expect(order).toEqual([]);
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

  test("two tournaments never send at once from the scorer wallet", async () => {
    let sending = 0;
    let overlapped = false;
    const finalize = createFinalizer({
      leaderboard: () => Promise.resolve(board("open", 900n)),
      async postResults() {
        sending += 1;
        overlapped ||= sending > 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        sending -= 1;
        return HASH;
      },
      now: () => 1_000_000,
    });
    await Promise.all([finalize(7n), finalize(8n)]);
    expect(overlapped).toBe(false);
  });

  test("waits for the indexer to list every entrant the chain has", async () => {
    const posted: bigint[] = [];
    const finalize = createFinalizer({
      leaderboard: () => Promise.resolve(board("open", 900n)),
      postResults: (id) => {
        posted.push(id);
        return Promise.resolve(HASH);
      },
      participants: () => Promise.resolve(5),
      now: () => 1_000_000,
    });
    await expect(finalize(7n)).rejects.toBeInstanceOf(IndexerBehindError);
    expect(posted).toHaveLength(0);
  });
});
