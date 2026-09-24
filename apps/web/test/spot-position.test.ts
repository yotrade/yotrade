import { describe, expect, test } from "bun:test";

import { spotPosition } from "@/lib/spot-position.ts";

describe("spotPosition", () => {
  test("PnL is the value at the book minus what the holding cost", () => {
    // 0.00097955 cbBTC (8 decimals) bought for $99.999951, now worth $82.437106.
    const p = spotPosition(97_955n, 82_437_106n, 8, { openSize: 97_955n, openCost: 99_999_951n });
    expect(p.cost).toBe(99_999_951n);
    expect(p.pnl).toBe(-17_562_845n);
    expect(p.entry).toBeCloseTo(102_087.64, 1);
  });

  test("part of the holding carries its share of the cost", () => {
    const p = spotPosition(50n, 70n, 0, { openSize: 100n, openCost: 120n });
    expect(p.cost).toBe(60n);
    expect(p.pnl).toBe(10n);
  });

  test("no fills or nothing held means no cost basis", () => {
    expect(spotPosition(10n, 5n, 6, undefined).pnl).toBeNull();
    expect(spotPosition(10n, 5n, 6, { openSize: 0n, openCost: 0n }).pnl).toBeNull();
    expect(spotPosition(0n, 0n, 6, { openSize: 5n, openCost: 5n }).pnl).toBeNull();
  });
});
