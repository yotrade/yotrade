import { describe, expect, test } from "bun:test";

import { createRuntime } from "@yotrade/core/plugin";
import { monadTestnet } from "viem/chains";

import { kuru } from "../src/plugin.ts";

/** Read-only checks against Monad testnet. Run with `bun run test:live`. */
const live = process.env["KURU_LIVE"] === "1" ? describe : describe.skip;

live("kuru plugin on Monad testnet", () => {
  const runtime = createRuntime({ chain: monadTestnet, plugins: [kuru()] });

  test("cbBTC/USDC has a two-sided book", async () => {
    const book = await runtime.kuru.market.book("cbBTC/USDC");
    expect(book.hasLiquidity).toBe(true);
    expect(book.pricePrecision).toBe(100n);
  });

  test("values the spike account from chain and from the data API", async () => {
    const trader = "0x3B4f0135465d444a5bD06Ab90fC59B73916C85F5";
    const id = await runtime.kuru.account.id(trader);
    expect(id).toBeGreaterThan(0n);

    const { totalUsdc } = await runtime.kuru.portfolio(trader);
    expect(totalUsdc).toBeGreaterThan(0n);
    expect((await runtime.kuru.data.balances(id)).length).toBeGreaterThan(0);
  });

  test("an address that never deposited has id 0", async () => {
    expect(await runtime.kuru.account.id("0x000000000000000000000000000000000000dEaD")).toBe(0n);
  });
});
