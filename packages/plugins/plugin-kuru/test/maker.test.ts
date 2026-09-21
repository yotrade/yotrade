import { describe, expect, test } from "bun:test";

import { ladder, type MarketSpec } from "../src/maker.ts";

// XAUt0/USDC on Kuru testnet: two price decimals, six size decimals, ten-dollar minimum.
const XAUT: MarketSpec = {
  pricePrecision: 100n,
  sizePrecision: 1_000_000n,
  tickSize: 1n,
  minQuoteNotional: 10_000_000n,
};

describe("ladder", () => {
  test("rests bids below and asks above, never crossing, budgets split evenly", () => {
    const orders = ladder(XAUT, {
      reference: 339_195n,
      stepBps: 20n,
      levels: 3,
      quoteBudget: 3_000_000_000n,
      baseBudget: 900_000n,
    });
    const bids = orders.filter((order) => order.side === "buy");
    const asks = orders.filter((order) => order.side === "sell");
    expect(bids.map((order) => order.price)).toEqual([338_517n, 337_839n, 337_160n]);
    expect(asks.map((order) => order.price)).toEqual([339_873n, 340_551n, 341_230n]);
    expect(Math.max(...bids.map((o) => Number(o.price)))).toBeLessThan(
      Math.min(...asks.map((o) => Number(o.price))),
    );
    // 1,000 USDC at 3,385.17 is 0.295406 XAUt0, rounded down.
    expect(bids[0]?.quantity).toBe(295_406n);
    expect(asks.every((order) => order.quantity === 300_000n)).toBe(true);
  });

  test("snaps to the tick away from the reference", () => {
    const orders = ladder(
      { ...XAUT, tickSize: 50n },
      {
        reference: 339_195n,
        stepBps: 1n,
        levels: 1,
        quoteBudget: 1_000_000_000n,
        baseBudget: 300_000n,
      },
    );
    expect(orders).toEqual([
      { side: "buy", price: 339_150n, quantity: 294_854n },
      { side: "sell", price: 339_250n, quantity: 300_000n },
    ]);
  });

  test("drops levels below the market's minimum notional instead of sending them to revert", () => {
    const orders = ladder(XAUT, {
      reference: 339_195n,
      stepBps: 20n,
      levels: 2,
      quoteBudget: 15_000_000n,
      baseBudget: 0n,
    });
    expect(orders).toEqual([]);
  });

  test("a one-sided budget gives a one-sided ladder", () => {
    const orders = ladder(XAUT, {
      reference: 339_195n,
      stepBps: 20n,
      levels: 2,
      quoteBudget: 2_000_000_000n,
      baseBudget: 0n,
    });
    expect(orders.every((order) => order.side === "buy")).toBe(true);
    expect(orders).toHaveLength(2);
  });

  test("rejects nonsense", () => {
    const base = { reference: 1n, stepBps: 1n, levels: 1, quoteBudget: 0n, baseBudget: 0n };
    expect(() => ladder(XAUT, { ...base, reference: 0n })).toThrow(RangeError);
    expect(() => ladder(XAUT, { ...base, levels: 0 })).toThrow(RangeError);
    expect(() => ladder(XAUT, { ...base, stepBps: 0n })).toThrow(RangeError);
  });
});
