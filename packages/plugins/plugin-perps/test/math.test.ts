import { describe, expect, test } from "bun:test";

import {
  applyFill,
  fee,
  liquidationPrice,
  maintenanceBps,
  maxAdd,
  maxMargin,
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

  test("a flip under water is refused like an open, as PerpsEngine.t.sol has it", () => {
    const held = [{ market: Btc, size: 3n * WAD, entryPrice: usd(60_000), price: usd(56_000) }];
    const plan = planOrder({
      balance: STARTING_BALANCE - usd(90),
      positions: held,
      market: Btc,
      price: usd(56_000),
      cap: 20n,
      side: "short",
      notionalUsd: usd(224_000),
    });
    expect(plan.position.size).toBe(-WAD);
    expect(plan.withinCap).toBe(false);
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

  test("the cap sets the maintenance: 0.1 BTC at 100,000 on 2,000 of equity at 5x is out near 88,889", () => {
    const at5 = liquidationPrice(usd(2000), WAD / 10n, usd(100_000), 5n) ?? 0n;
    expect(at5 / WAD).toBe(88_888n);
    // Read at the default 100x instead, the same position looks safe down to about 80,400.
    expect((liquidationPrice(usd(2000), WAD / 10n, usd(100_000)) ?? 0n) / WAD).toBe(80_402n);
  });

  test("other markets' maintenance comes out of what this position can lose", () => {
    const alone = liquidationPrice(usd(9910), 3n * WAD, usd(60_000), 20n) ?? 0n;
    const withEth = liquidationPrice(usd(9910), 3n * WAD, usd(60_000), 20n, usd(40_000)) ?? 0n;
    expect(withEth).toBeGreaterThan(alone);
    const short = liquidationPrice(usd(9910), -3n * WAD, usd(60_000), 20n, usd(40_000)) ?? 0n;
    expect(short).toBeLessThan(liquidationPrice(usd(9910), -3n * WAD, usd(60_000), 20n) ?? 0n);
    // Already under maintenance, counting the other markets: out at the current price, either side.
    expect(liquidationPrice(0n, -WAD, usd(60_000), 20n, usd(400_000))).toBe(usd(60_000));
    expect(liquidationPrice(usd(100), WAD, usd(60_000), 20n, usd(400_000))).toBe(usd(60_000));
  });
});

describe("maxMargin", () => {
  test("MAX at a multiple equal to the cap fits the cap once the fee is paid", () => {
    for (const cap of [5n, 20n, 100n]) {
      const flat = risk(STARTING_BALANCE, [], cap);
      const margin = (maxMargin(flat, usd(60_000), cap, cap) * 998n) / 1000n;
      const plan = planOrder({
        balance: STARTING_BALANCE,
        positions: [],
        market: "0xbtc",
        price: usd(60_000),
        side: "long",
        notionalUsd: margin * cap,
        cap,
      });
      expect(plan.withinCap).toBe(true);
    }
  });

  test("a low multiple is limited by the free margin, and nothing is free under water", () => {
    const flat = risk(STARTING_BALANCE, [], 100n);
    expect(maxMargin(flat, usd(60_000), 100n, 1n)).toBe(STARTING_BALANCE);
    const sunk = risk(-usd(1), [], 100n);
    expect(maxMargin(sunk, usd(60_000), 100n, 10n)).toBe(0n);
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
