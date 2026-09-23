import { describe, expect, test } from "bun:test";

import { midPrice, minAmountOut, priceImpactBps, toBook, valueInQuote } from "../src/pricing.ts";

describe("toBook", () => {
  test("flags a two-sided book as liquid", () => {
    const book = toBook(10_151_541n, 10_202_644n, 100n);
    expect(book.hasLiquidity).toBe(true);
    expect(midPrice(book)).toBeCloseTo(101_770.925, 3);
  });

  test("treats Kuru's empty-side sentinels as no liquidity", () => {
    expect(toBook(4_294_967_295n, 0n, 100n).hasLiquidity).toBe(false);
    expect(toBook(0n, 10n, 100n).hasLiquidity).toBe(false);
    expect(toBook(10n, 0n, 100n).hasLiquidity).toBe(false);
  });

  test("rejects a crossed book", () => {
    expect(toBook(101n, 100n, 100n).hasLiquidity).toBe(false);
  });
});

describe("valueInQuote", () => {
  const btc = toBook(10_000_000n, 10_000_200n, 100n); // mid 100,001.00

  test("values cbBTC (8 decimals) in USDC (6 decimals) at the mid", () => {
    expect(valueInQuote(100_000_000n, 8, 6, btc)).toBe(100_001_000_000n); // 1 BTC
    expect(valueInQuote(97_955n, 8, 6, btc)).toBe(97_955_979n); // the spike's fill, about 97.96 USDC
  });

  test("marks at the ask when buyers emptied the bids, and at zero on an empty book", () => {
    const asksOnly = toBook(0n, 10_000_200n, 100n);
    expect(valueInQuote(100_000_000n, 8, 6, asksOnly)).toBe(100_002_000_000n);
    expect(valueInQuote(100_000_000n, 8, 6, toBook(0n, 0n, 100n))).toBe(0n);
  });

  test("values an 18-decimal token with a six-decimal price", () => {
    const mon = toBook(50_754n, 50_856n, 1_000_000n); // mid 0.050805
    expect(valueInQuote(10n ** 18n, 18, 6, mon)).toBe(50_805n);
  });

  test("rounds down and never invents value", () => {
    expect(valueInQuote(1n, 8, 6, btc)).toBe(1_000n);
    expect(valueInQuote(0n, 8, 6, btc)).toBe(0n);
    expect(valueInQuote(100_000_000n, 8, 6, toBook(4_294_967_295n, 0n, 100n))).toBe(0n);
  });
});

describe("minAmountOut", () => {
  test("applies the tolerance in basis points, rounding down", () => {
    expect(minAmountOut(97_955n, 50)).toBe(97_465n);
    expect(minAmountOut(1_000n, 0)).toBe(1_000n);
  });

  test("rejects nonsense tolerances", () => {
    expect(() => minAmountOut(1n, -1)).toThrow(RangeError);
    expect(() => minAmountOut(1n, 10_000)).toThrow(RangeError);
    expect(() => minAmountOut(1n, 0.5)).toThrow(RangeError);
  });
});

describe("priceImpactBps", () => {
  // cbBTC/USDC on 2026-09-21: bid 76,523.44, ask 102,535.67, price precision 100.
  const book = toBook(7_652_344n, 10_253_567n, 100n);

  test("is about the fee when the order fits at the top of the book", () => {
    // 2,500 USDC at the ask buys 0.02438176 cbBTC; the quote was 0.02436478.
    expect(priceImpactBps(true, 2_500_000_000n, 2_436_478n, 8, 6, book)).toBe(6);
  });

  test("catches the sell that walked the bid side and filled only in part", () => {
    // 0.02436478 cbBTC at the best bid is 1,864.47 USDC; the account received 1,181.33.
    const impact = priceImpactBps(false, 2_436_478n, 1_181_333_713n, 8, 6, book);
    expect(impact).toBeGreaterThan(3_000);
  });

  test("never reports a negative impact", () => {
    expect(priceImpactBps(true, 1_000_000n, 10n ** 12n, 8, 6, book)).toBe(0);
  });
});

describe("one-sided books", () => {
  // MON/USDC after its ask side was bought out: bid 0.050754, no asks.
  const bidsOnly = toBook(50_754n, 0n, 1_000_000n);
  // cbBTC/USDC after its bid side was sold out.
  const asksOnly = toBook(4_294_967_295n, 10_253_567n, 100n);

  test("know which side can still trade", () => {
    expect([bidsOnly.hasBid, bidsOnly.hasAsk, bidsOnly.hasLiquidity]).toEqual([true, false, false]);
    expect([asksOnly.hasBid, asksOnly.hasAsk, asksOnly.hasLiquidity]).toEqual([false, true, false]);
  });

  test("inventory is marked at the bid when that is all there is, and at zero when nobody bids", () => {
    expect(valueInQuote(1_800n * 10n ** 18n, 18, 6, bidsOnly)).toBe(91_357_200n);
    expect(valueInQuote(888_740n, 8, 6, asksOnly)).toBe(0n);
  });
});
