import { describe, expect, test } from "bun:test";

import {
  applyFill,
  fee,
  liquidationPrice,
  maintenanceBps,
  maxAdd,
  planOrder,
  pnl,
  risk,
  roiPpm,
  STARTING_BALANCE,
  toWad,
  WAD,
} from "../src/math.ts";

const usd = (value: number) => BigInt(value) * WAD;

describe("perps math mirrors the contract tests", () => {
  test("a fee is five basis points, rounded up", () => {
    expect(fee(WAD, usd(60_000))).toBe(usd(30));
    expect(fee(1n, usd(1))).toBe(1n);
    expect(fee(0n, usd(60_000))).toBe(0n);
  });

  test("a short profits when the price falls", () => {
    expect(pnl({ size: -WAD, entryPrice: usd(60_000) }, usd(57_000))).toBe(usd(3000));
  });

  test("the liquidation example from PerpsEngine.t.sol", () => {
    // 3 BTC from 60,000 and 1 ETH at 3,000, BTC now 57,500: equity 2,408.5 against 4,387.5 of maintenance.
    const balance = STARTING_BALANCE - usd(90) - usd(3) / 2n;
    const account = risk(
      balance,
      [
        { size: 3n * WAD, entryPrice: usd(60_000), price: usd(57_500) },
        { size: WAD, entryPrice: usd(3000), price: usd(3000) },
      ],
      20n,
    );
    expect(account.equity).toBe(usd(4817) / 2n);
    expect(account.notional).toBe(usd(175_500));
    expect(account.liquidatable).toBe(true);
  });

  test("leverage is zero when flat and unknown once equity is gone", () => {
    expect(risk(STARTING_BALANCE, []).leverageX100).toBe(0n);
    expect(risk(0n, [{ size: WAD, entryPrice: usd(100), price: usd(50) }]).leverageX100).toBeNull();
  });

  test("the largest add sits exactly on the cap", () => {
    const flat = risk(STARTING_BALANCE, []);
    const size = maxAdd(flat, usd(60_000), 20n);
    const after = (size * usd(60_000)) / WAD;
    expect(after <= (STARTING_BALANCE - fee(size, usd(60_000))) * 20n).toBe(true);
    // One more cent of notional would not fit.
    const more = size + WAD / 1000n;
    expect((more * usd(60_000)) / WAD > (STARTING_BALANCE - fee(more, usd(60_000))) * 20n).toBe(
      true,
    );
    expect(maxAdd(risk(0n, []), usd(60_000), 20n)).toBe(0n);
  });

  test("a score is floored at a total loss", () => {
    expect(roiPpm(STARTING_BALANCE + usd(500))).toBe(50_000);
    expect(roiPpm(-usd(1))).toBe(-1_000_000);
  });

  test("Pyth exponents scale to 1e18 and bad prices throw", () => {
    expect(toWad(8_123_122_227_516n, -8)).toBe(81_231_222_275_160_000_000_000n);
    expect(() => toWad(0n, -8)).toThrow();
    expect(() => toWad(1n, 1)).toThrow();
  });
});

describe("planning an order", () => {
  const Btc = "0xbtc";

  test("the live fill from testnet: 0.5 BTC long costs five basis points and sits at 4.3x", () => {
    const price = 86_639_971_973_890_000_000_000n;
    const plan = planOrder({
      balance: STARTING_BALANCE,
      positions: [],
      market: Btc,
      price,
      cap: 20n,
      side: "long",
      notionalUsd: price / 2n,
    });
    expect(plan.sizeDelta).toBe(WAD / 2n);
    // The chain reported a balance of 9,978.340007006527500000 after this exact fill.
    expect(STARTING_BALANCE - plan.fee).toBe(9_978_340_007_006_527_500_000n);
    expect(plan.withinCap).toBe(true);
    expect(plan.after.leverageX100).toBe(434n);
  });

  test("the cap example from PerpsEngine.t.sol: 4 BTC at 60,000 is refused, 3 BTC passes", () => {
    const order = {
      balance: STARTING_BALANCE,
      positions: [],
      market: Btc,
      price: usd(60_000),
      cap: 20n,
      side: "long",
    } as const;
    expect(planOrder({ ...order, notionalUsd: usd(240_000) }).withinCap).toBe(false);
    expect(planOrder({ ...order, notionalUsd: usd(180_000) }).withinCap).toBe(true);
    // The same order at a 100x cap is nowhere near the limit; at 5x it is far over.
    expect(planOrder({ ...order, notionalUsd: usd(240_000), cap: 100n }).withinCap).toBe(true);
    expect(planOrder({ ...order, notionalUsd: usd(60_000), cap: 5n }).withinCap).toBe(false);
  });

  test("closing realizes the move and is never capped, even under water", () => {
    const held = [{ market: Btc, size: 3n * WAD, entryPrice: usd(60_000), price: usd(56_000) }];
    const plan = planOrder({
      balance: STARTING_BALANCE - usd(90),
      positions: held,
      market: Btc,
      price: usd(56_000),
      cap: 20n,
      side: "short",
      notionalUsd: usd(168_000),
    });
    expect(plan.position.size).toBe(0n);
    expect(plan.realized).toBe(-usd(12_000));
    expect(plan.withinCap).toBe(true);
    expect(plan.liquidationPrice).toBeNull();
  });

  test("a flip restarts the entry at the fill price", () => {
    const { next, realized } = applyFill(
      { size: WAD, entryPrice: usd(60_000) },
      -3n * WAD,
      usd(61_000),
    );
    expect(next).toEqual({ size: -2n * WAD, entryPrice: usd(61_000) });
    expect(realized).toBe(usd(1000));
  });

  test("liquidation estimates sit on the losing side and vanish for a fully backed long", () => {
    // 3 BTC at 60,000 on 9,910 of equity: maintenance is reached a little under 58,200.
    const long = liquidationPrice(usd(9910), 3n * WAD, usd(60_000), 20n) ?? 0n;
    expect(long > usd(58_000) && long < usd(58_300)).toBe(true);
    const short = liquidationPrice(usd(9910), -3n * WAD, usd(60_000), 20n) ?? 0n;
    expect(short > usd(61_700) && short < usd(62_000)).toBe(true);
    expect(liquidationPrice(usd(10_000), WAD / 10n, usd(60_000), 20n)).toBeNull();
  });
});

describe("leverage caps", () => {
  test("maintenance is half the initial margin and the room to add scales with the cap", () => {
    expect(maintenanceBps(5n)).toBe(1_000n);
    expect(maintenanceBps(20n)).toBe(250n);
    expect(maintenanceBps(100n)).toBe(50n);
    const flat = risk(STARTING_BALANCE, []);
    expect(maxAdd(flat, usd(60_000), 100n)).toBeGreaterThan(maxAdd(flat, usd(60_000), 20n) * 4n);
    // A long at 100x is liquidated far closer to its entry than at 20x.
    const at100 = liquidationPrice(STARTING_BALANCE, 15n * WAD, usd(60_000), 100n) ?? 0n;
    const at20 = liquidationPrice(STARTING_BALANCE, 3n * WAD, usd(60_000), 20n) ?? 0n;
    expect(at100).toBeGreaterThan(at20);
  });
});
