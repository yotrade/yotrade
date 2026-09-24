import { describe, expect, test } from "bun:test";

import { pnlOf, rank, roiPpm, type Scored, valueAt, winnersOf } from "../src/server/scoring.ts";

const MARKET = "0x5bdea6f9f9aba34f4ecb9b865646a792b835ef7f";
const row = (participant: string, ppm: number, joinedAt: bigint, fills = 1): Scored => ({
  participant: participant as Scored["participant"],
  tradingAccount: participant as Scored["participant"],
  joinedAt,
  capitalAtJoin: 10_000_000_000n,
  pnl: 0n,
  roiPpm: ppm,
  fills,
});

describe("scoring", () => {
  test("PnL is realized plus open inventory at the mark minus its cost", () => {
    const performance = {
      realizedUsdc: -35_545_101n,
      fills: 4,
      positions: [{ market: MARKET, openSize: 97_955n, openCost: 99_999_951n }],
      opening: [],
    } as const;
    // 0.00097955 cbBTC marked at 87.70 USDC
    expect(
      pnlOf(
        performance,
        () => 87_700_000n,
        () => null,
      ),
    ).toBe(-35_545_101n + 87_700_000n - 99_999_951n);
  });

  test("a bag bought before the start scores only what it did during the window", () => {
    const bag = { market: MARKET, openSize: 97_955n, openCost: 99_999_951n } as const;
    const held = { realizedUsdc: 0n, fills: 0, positions: [bag], opening: [bag] } as const;
    // Bought for $100, worth $82.44 at the start and $85 at the end: +$2.56, not −$15.
    expect(
      pnlOf(
        held,
        () => 85_000_000n,
        () => 82_440_000n,
      ),
    ).toBe(2_560_000n);
    // No price at the start: it counts from its cost.
    expect(
      pnlOf(
        held,
        () => 85_000_000n,
        () => null,
      ),
    ).toBe(85_000_000n - 99_999_951n);
  });

  test("a deposit cannot move the score: only fills and marks are inputs", () => {
    const idle = { realizedUsdc: 0n, fills: 0, positions: [], opening: [] } as const;
    expect(
      pnlOf(
        idle,
        () => 0n,
        () => 0n,
      ),
    ).toBe(0n);
    expect(roiPpm(0n, 10_000_000_000n)).toBe(0);
  });

  test("ROI is measured in parts per million of the capital at join", () => {
    expect(roiPpm(-35_545_101n, 10_000_000_000n)).toBe(-3554);
    expect(roiPpm(250_000_000n, 10_000_000_000n)).toBe(25_000);
    expect(roiPpm(1n, 0n)).toBe(0);
  });

  test("ranks by return, then by who joined first", () => {
    const ranked = rank([row("0xc", 100, 3n), row("0xa", 500, 2n), row("0xb", 100, 1n)]);
    expect(ranked.map((r) => r.participant)).toEqual(["0xa", "0xb", "0xc"]);
  });

  test("everyone who traded ranks above everyone who did not, as prizes do", () => {
    const ranked = rank([
      row("0xidle", 0, 1n, 0),
      row("0xloser", -900, 2n),
      row("0xwinner", 40, 3n),
    ]);
    expect(ranked.map((r) => r.participant)).toEqual(["0xwinner", "0xloser", "0xidle"]);
  });

  test("only traders with fills can take a prize rank", () => {
    const ranked = rank([
      row("0xidle", 0, 1n, 0),
      row("0xloser", -900, 2n),
      row("0xwinner", 40, 3n),
    ]);
    expect(winnersOf(ranked, 3)).toEqual(["0xwinner", "0xloser"]);
    expect(winnersOf(ranked, 1)).toEqual(["0xwinner"]);
  });
});

describe("valueAt", () => {
  test("a base amount at one price, in raw quote units", () => {
    // 0.00097955 cbBTC (8 decimals) at $84,666.00 (precision 100) is $82.935...
    expect(valueAt(97_955n, 8_466_600n, 100n, 8, 6)).toBe(82_934_580n);
    expect(valueAt(0n, 8_466_600n, 100n, 8, 6)).toBe(0n);
  });
});
