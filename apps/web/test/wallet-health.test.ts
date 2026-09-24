import { describe, expect, test } from "bun:test";

import { parseEther } from "viem";

import { walletHealth } from "../src/server/wallet-health.ts";

const A = "0x00000000000000000000000000000000000000a1" as const;

describe("walletHealth", () => {
  test("flags each configured wallet below its floor, and only those", () => {
    const { wallets, attention } = walletHealth({
      drip: { address: A, balance: parseEther("1.5") },
      liquidator: { address: A, balance: parseEther("1.5") },
    });
    expect(attention).toEqual(["drip"]);
    expect(wallets.drip).toEqual({ address: A, mon: "1.5", low: true });
    expect(wallets.liquidator?.low).toBe(false);
    expect(wallets.scorer).toBeUndefined();
  });
});
