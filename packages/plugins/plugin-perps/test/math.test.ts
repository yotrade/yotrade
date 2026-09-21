import { describe, expect, test } from "bun:test";

import { fee, maxAdd, pnl, risk, roiPpm, STARTING_BALANCE, toWad, WAD } from "../src/math.ts";

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
    const account = risk(balance, [
      { size: 3n * WAD, entryPrice: usd(60_000), price: usd(57_500) },
      { size: WAD, entryPrice: usd(3000), price: usd(3000) },
    ]);
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
    const size = maxAdd(flat, usd(60_000));
    const after = (size * usd(60_000)) / WAD;
    expect(after <= (STARTING_BALANCE - fee(size, usd(60_000))) * 20n).toBe(true);
    // One more cent of notional would not fit.
    const more = size + WAD / 1000n;
    expect((more * usd(60_000)) / WAD > (STARTING_BALANCE - fee(more, usd(60_000))) * 20n).toBe(
      true,
    );
    expect(maxAdd(risk(0n, []), usd(60_000))).toBe(0n);
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
