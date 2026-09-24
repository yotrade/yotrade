import { describe, expect, test } from "bun:test";

import type { Address, Hash, Hex } from "viem";

import { type LiquidatorPerps, sweep } from "../src/liquidator.ts";
import { STARTING_BALANCE, WAD } from "../src/math.ts";

const BTC = "0xbtc" as Hex;
const usd = (value: number) => BigInt(value) * WAD;
const trader = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;

/** Alice is 3 BTC long from 60,000 at 20x; at 56,000 she is under maintenance. Bob has nothing open. */
function fakePerps(failFor: Address | null = null) {
  const liquidated: Address[] = [];
  const perps: LiquidatorPerps = {
    leverageCapOf: () => Promise.resolve(20n),
    account: (_id, who) =>
      Promise.resolve(
        who === trader(2)
          ? { balance: STARTING_BALANCE, positions: [] }
          : {
              balance: STARTING_BALANCE - usd(90),
              positions: [{ market: BTC, size: 3n * WAD, entryPrice: usd(60_000) }],
            },
      ),
    latest: () => Promise.resolve({ prices: { [BTC]: { price: usd(56_000) } } }),
    liquidate: (_wallet, target) => {
      if (target.trader === failFor) {
        return Promise.reject(new Error("NotLiquidatable\nmore"));
      }
      liquidated.push(target.trader);
      return Promise.resolve("0x01" as Hash);
    },
  };
  return { perps, liquidated };
}

describe("sweep", () => {
  test("liquidates the accounts under maintenance and skips the rest", async () => {
    const { perps, liquidated } = fakePerps();
    const result = await sweep(perps, {} as never, [
      { id: 1n, tradingAccounts: [trader(1), trader(2)] },
    ]);
    expect(result).toEqual({ checked: 1, due: 1, liquidated: 1, failed: 0 });
    expect(liquidated).toEqual([trader(1)]);
  });

  test("one failure is counted and the sweep carries on", async () => {
    const { perps, liquidated } = fakePerps(trader(1));
    const lines: string[] = [];
    const result = await sweep(
      perps,
      {} as never,
      [{ id: 1n, tradingAccounts: [trader(1), trader(3)] }],
      (line) => lines.push(line),
    );
    expect(result).toEqual({ checked: 2, due: 2, liquidated: 1, failed: 1 });
    expect(liquidated).toEqual([trader(3)]);
    expect(lines[0]).toContain("NotLiquidatable");
  });

  test("without a wallet it only reports", async () => {
    const { perps, liquidated } = fakePerps();
    const result = await sweep(perps, null, [{ id: 1n, tradingAccounts: [trader(1)] }]);
    expect(result).toEqual({ checked: 1, due: 1, liquidated: 0, failed: 0 });
    expect(liquidated).toHaveLength(0);
  });
});
