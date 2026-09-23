import { describe, expect, test } from "bun:test";

import { tradeGate } from "@/lib/trade-window.ts";

describe("tradeGate", () => {
  test("only a live tournament trades; everything else says why not", () => {
    expect(tradeGate("live", "")).toBeNull();
    expect(tradeGate("unknown", "")).toBeNull();
    expect(tradeGate("upcoming", "2m 10s")).toBe("Trading opens in 2m 10s");
    expect(tradeGate("scoring", "")).toMatch(/ended/);
    expect(tradeGate("claimable", "")).toMatch(/ended/);
    expect(tradeGate("cancelled", "")).toMatch(/called off/);
  });
});
