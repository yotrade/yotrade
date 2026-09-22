import { describe, expect, test } from "bun:test";

import { summarize } from "@/lib/entry-summary.ts";

const base = {
  tournament: { startTime: 1_000n, endTime: 2_000n },
  entry: { capitalAtJoin: 10_000_000_000n, prize: 0n, claimed: false, rank: null },
  value: null,
} as never;
const at = (phase: string, patch: object = {}) =>
  ({ ...base, phase, entry: { ...base.entry, ...patch } }) as never;

describe("entry summary", () => {
  test("running: the return and the clock", () => {
    expect(summarize(at("upcoming"), 500n)).toEqual({ headline: "—", line: "Starts in 8m 20s" });
    expect(summarize({ ...at("live"), value: 10_500_000_000n } as never, 1_500n)).toEqual({
      headline: "+5.00%",
      line: "Live · 8m 20s left",
    });
  });

  test("ended but unscored is not a loss", () => {
    expect(summarize(at("scoring"), 3_000n)).toEqual({
      headline: "Ended",
      line: "Waiting for results",
    });
    expect(summarize(at("dispute", { rank: 2 }), 3_000n)).toEqual({
      headline: "#2",
      line: "Results in review",
    });
  });

  test("final: what was won, or the rank", () => {
    expect(summarize(at("claimable", { rank: 1, prize: 50_000_000n }), 3_000n)).toEqual({
      headline: "Won $50.00",
      line: "Claim your prize",
    });
    expect(
      summarize(at("claimable", { rank: 1, prize: 50_000_000n, claimed: true }), 3_000n).line,
    ).toBe("Claimed");
    expect(summarize(at("claimable", { rank: 4 }), 3_000n)).toEqual({
      headline: "#4",
      line: "Finished",
    });
    expect(summarize(at("claimable"), 3_000n)).toEqual({ headline: "Finished", line: "No prize" });
  });
});
