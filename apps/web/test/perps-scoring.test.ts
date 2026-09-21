import { describe, expect, test } from "bun:test";

import { STARTING_BALANCE, WAD } from "@yotrade/plugin-perps/math";

import { scorePerps } from "@/server/perps-scoring.ts";

const BTC = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const ENTRY = {
  participant: "0x00000000000000000000000000000000000a11ce",
  tradingAccount: "0x00000000000000000000000000000000000a11ce",
  joinedAt: 1n,
  capitalAtJoin: 10_000_000_000n,
} as const;
const usd = (value: number) => BigInt(value) * WAD;

describe("futures scoring", () => {
  test("an untouched account scores zero and cannot win", () => {
    const row = scorePerps(ENTRY, { balance: STARTING_BALANCE, positions: [] }, {});
    expect(row).toMatchObject({ pnl: 0n, roiPpm: 0, fills: 0 });
  });

  test("open positions are marked at the given prices, in six-decimal dollars", () => {
    const account = {
      balance: STARTING_BALANCE - usd(30),
      positions: [{ market: BTC, size: WAD, entryPrice: usd(60_000) }],
    } as const;
    const row = scorePerps(ENTRY, account, { [BTC]: usd(61_000) });
    expect(row.pnl).toBe(970_000_000n);
    expect(row.roiPpm).toBe(97_000);
    expect(row.fills).toBe(1);
  });

  test("a wiped account scores a total loss, never less", () => {
    const account = {
      balance: STARTING_BALANCE,
      positions: [{ market: BTC, size: 3n * WAD, entryPrice: usd(60_000) }],
    } as const;
    const row = scorePerps(ENTRY, account, { [BTC]: usd(50_000) });
    expect(row.pnl).toBe(-10_000_000_000n);
    expect(row.roiPpm).toBe(-1_000_000);
  });

  test("a position without a price fails loudly instead of scoring it at zero", () => {
    const account = {
      balance: STARTING_BALANCE,
      positions: [{ market: BTC, size: WAD, entryPrice: usd(1) }],
    } as const;
    expect(() => scorePerps(ENTRY, account, {})).toThrow("No price");
  });
});
