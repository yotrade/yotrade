import { describe, expect, test } from "bun:test";

import {
  fillableWithin,
  formatBps,
  parseTicket,
  roiBps,
  shortcutAmount,
} from "../src/lib/ticket.ts";

describe("parseTicket", () => {
  test("parses against the token's decimals", () => {
    expect(parseTicket("100.5", 6, 1_000_000_000n)).toEqual({ ok: true, amount: 100_500_000n });
    expect(parseTicket(".5", 8, 100_000_000n)).toEqual({ ok: true, amount: 50_000_000n });
  });

  test("rejects what could only revert or mislead", () => {
    for (const bad of ["", ".", "abc", "-1", "1e3", "1,000", "0", "0.0"]) {
      expect(parseTicket(bad, 6, 10n ** 12n).ok).toBe(false);
    }
    expect(parseTicket("0.0000001", 6, 10n ** 12n)).toEqual({
      ok: false,
      reason: "At most 6 decimals",
    });
    expect(parseTicket("2", 6, 1_999_999n)).toEqual({
      ok: false,
      reason: "More than you have available",
    });
  });
});

describe("roi", () => {
  test("is measured in basis points against the capital at join", () => {
    expect(roiBps(10_250_000_000n, 10_000_000_000n)).toBe(250);
    expect(roiBps(9_000_000_000n, 10_000_000_000n)).toBe(-1000);
    expect(roiBps(1n, 0n)).toBeNull();
    expect(formatBps(250)).toBe("+2.50%");
    expect(formatBps(-1000)).toBe("−10.00%");
    // Too small to show: no signed zero.
    expect(formatBps(-0.4)).toBe("0.00%");
    expect(formatBps(0)).toBe("0.00%");
  });
});

describe("shortcutAmount", () => {
  test("rounds down to cents for a dollar token, never above the balance", () => {
    // 25 % of 9,950.005028 USDC is 2,487.501257: the field gets 2487.5.
    expect(shortcutAmount(9_950_005_028n, 25n, 6, true)).toBe("2487.5");
    expect(shortcutAmount(9_950_005_028n, 100n, 6, true)).toBe("9950");
    expect(shortcutAmount(1_999_999n, 100n, 6, true)).toBe("1.99");
  });

  test("keeps six decimals at most for other tokens and drops trailing zeros", () => {
    expect(shortcutAmount(1_800n * 10n ** 18n, 50n, 18, false)).toBe("900");
    expect(shortcutAmount(123_456_789_123_456_789n, 100n, 18, false)).toBe("0.123456");
    expect(shortcutAmount(2_436_478n, 100n, 8, false)).toBe("0.024364");
    expect(shortcutAmount(0n, 100n, 6, true)).toBe("0");
  });

  test("whatever it writes parses back to an amount the balance covers", () => {
    for (const [available, decimals, dollar] of [
      [9_950_005_028n, 6, true],
      [123_456_789_123_456_789n, 18, false],
      [2_436_478n, 8, false],
    ] as const) {
      const text = shortcutAmount(available, 100n, decimals, dollar);
      expect(parseTicket(text, decimals, available).ok).toBe(true);
    }
  });
});

describe("fillableWithin", () => {
  // Prices in hundredths, sizes in hundred-millionths: 4,300.00 and 0.10 read as 430000 and 10000000.
  const units = {
    pricePrecision: 100n,
    sizePrecision: 100_000_000n,
    baseDecimals: 6,
    quoteDecimals: 6,
  };
  const depth = {
    asks: [
      { price: 430_000n, size: 10_000_000n },
      { price: 431_000n, size: 10_000_000n },
      { price: 1_000_000n, size: 100_000_000n },
    ],
    bids: [
      { price: 429_000n, size: 20_000_000n },
      { price: 100_000n, size: 100_000_000n },
    ],
  };

  test("a buy sums the asks inside the band in quote units, and stops at the first level outside it", () => {
    // 0.1 × 4,300 + 0.1 × 4,310 = 861 USDC; the 10,000 ask is far outside 2.5%.
    expect(fillableWithin(depth, true, 250, units)).toBe(861_000_000n);
  });

  test("a sell sums the bids inside the band in base units", () => {
    expect(fillableWithin(depth, false, 250, units)).toBe(200_000n);
    expect(fillableWithin({ asks: [], bids: [] }, false, 250, units)).toBe(0n);
  });

  test("shortcuts never exceed the cap", () => {
    expect(shortcutAmount(10_000_000_000n, 25n, 6, true, 861_000_000n)).toBe("861");
    expect(shortcutAmount(10_000_000_000n, 25n, 6, true, 5_000_000_000n)).toBe("2500");
  });
});
