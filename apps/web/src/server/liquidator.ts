import { yotrade } from "@yotrade/core/addresses";
import { liveFuturesTournaments, sweep } from "@yotrade/plugin-perps/liquidator";
import { createWalletClient, custom, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { publicEnv } from "@/lib/env.ts";
import { parseServerEnv } from "@/lib/server-env.ts";
import { serverRuntime } from "./runtime.ts";

const EVERY_MS = 30_000;

/**
 * Sweeps every running futures tournament for accounts under maintenance, every 30 seconds, from the app
 * server. At 100x a position crosses maintenance on a 0.5% move; a scheduled workflow that GitHub runs a few
 * times a day is only the fallback. One sweep at a time: a slow one is never overlapped by the next.
 */
export function startLiquidator(): void {
  const key = parseServerEnv({
    LIQUIDATOR_PRIVATE_KEY: process.env["LIQUIDATOR_PRIVATE_KEY"],
  }).LIQUIDATOR_PRIVATE_KEY;
  if (!key) {
    return;
  }
  const runtime = serverRuntime();
  const wallet = createWalletClient({
    account: privateKeyToAccount(key as Hex),
    chain: runtime.chain,
    transport: custom(runtime.publicClient),
  });
  let running = false;
  const tick = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const live = await liveFuturesTournaments(
        publicEnv.NEXT_PUBLIC_INDEXER_URL,
        yotrade.perpsVenueAdapter,
        Math.floor(Date.now() / 1000),
      );
      const result = await sweep(runtime.perps, wallet, live, (line) =>
        console.info(`liquidator: ${line}`),
      );
      if (result.due > 0) {
        console.info(
          `liquidator: ${result.liquidated} of ${result.due} due liquidated, ${result.failed} failed`,
        );
      }
    } catch (cause) {
      console.error("liquidator: sweep failed", cause);
    } finally {
      running = false;
    }
  };
  setInterval(tick, EVERY_MS).unref();
  console.info(`liquidator: sweeping every ${EVERY_MS / 1000} s as ${wallet.account.address}`);
}
