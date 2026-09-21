import { describe, expect, test } from "bun:test";

import { createRuntime } from "@yotrade/core/plugin";
import { custom } from "viem";
import { monadTestnet } from "viem/chains";

import { alchemy } from "../src/plugin.ts";
import { alchemyRpcUrl } from "../src/transport.ts";

const USDC = "0xEe0722ead54f1B4fe97bE399Be43BC0226a6f97E";
const WETH = "0x8B6C5fafeF85B030bB1e71ae7ac085cC2380aAf8";
const OWNER = "0x3B4f0135465d444a5bD06Ab90fC59B73916C85F5";

describe("alchemyRpcUrl", () => {
  test("targets the Monad network matching the chain id", () => {
    expect(alchemyRpcUrl("key", 10143)).toBe("https://monad-testnet.g.alchemy.com/v2/key");
    expect(alchemyRpcUrl("key", 143)).toBe("https://monad-mainnet.g.alchemy.com/v2/key");
  });

  test("refuses an empty key instead of building a broken URL", () => {
    expect(() => alchemyRpcUrl("  ", 10143)).toThrow(/empty/);
  });
});

describe("alchemy plugin", () => {
  test("decodes balances and drops empty ones", async () => {
    const calls: unknown[] = [];
    const transport = custom({
      request: (args: { method: string; params: unknown }) => {
        calls.push(args);
        return Promise.resolve({
          tokenBalances: [
            { contractAddress: USDC, tokenBalance: "0x2540be400" },
            { contractAddress: WETH, tokenBalance: "0x0" },
          ],
        });
      },
    });

    const runtime = createRuntime({
      chain: monadTestnet,
      transport,
      plugins: [alchemy({ apiKey: "unused", transport })],
    });

    expect(await runtime.alchemy.getTokenBalances(OWNER, [USDC, WETH])).toEqual([
      { token: USDC, balance: 10_000_000_000n },
    ]);
    expect(calls).toEqual([{ method: "alchemy_getTokenBalances", params: [OWNER, [USDC, WETH]] }]);
  });
});
