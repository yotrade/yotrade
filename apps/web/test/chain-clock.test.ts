import { describe, expect, test } from "bun:test";

import { chainNow, offsetFrom, syncChainClock } from "@/lib/chain-clock.ts";

describe("chain clock", () => {
  test("a block a second old is not skew; a phone two minutes slow is", () => {
    expect(offsetFrom(1_000n, 1_001_000)).toBe(0);
    expect(offsetFrom(1_120n, 1_000_000)).toBe(120_000);
    expect(offsetFrom(1_000n, 1_300_000)).toBe(-300_000);
  });

  test("once synced, now follows the chain", async () => {
    const chain = BigInt(Math.floor(Date.now() / 1000)) + 600n;
    await syncChainClock(() => Promise.resolve(chain));
    const drift = chainNow() - chain;
    expect(drift >= 0n && drift <= 1n).toBe(true);
  });
});
