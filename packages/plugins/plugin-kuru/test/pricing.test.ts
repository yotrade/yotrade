import { describe, expect, test } from "bun:test";

import { midPrice, minAmountOut, toBook, valueInQuote } from "../src/pricing.ts";

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
