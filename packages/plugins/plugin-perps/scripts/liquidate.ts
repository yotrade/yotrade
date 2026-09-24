/**
 * Liquidates every futures account under its maintenance margin, in every running tournament. Anyone may do
 * this and rivals are motivated to; this runs so that nobody has to. At 100x a position can be under water
 * for minutes before a human notices, and an account left negative distorts the leaderboard.
 *
 *   bun run liquidate             # plan only: prints what it would liquidate
 *   bun run liquidate --execute   # sends the transactions
 *
 * Needs LIQUIDATOR_PRIVATE_KEY (any testnet account with a little MON) and PYTH_API_KEY for Hermes.
 */
import { yotrade } from "@yotrade/core/addresses";
import { createRuntime } from "@yotrade/core/plugin";
import { createWalletClient, formatEther, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

import { hermes } from "../src/hermes.ts";
import { liveFuturesTournaments, sweep } from "../src/liquidator.ts";
import { perps } from "../src/plugin.ts";

// An unset workflow variable arrives as an empty string, so empty means "use the default" too.
const INDEXER_URL =
  process.env["INDEXER_URL"] || "https://indexer.dev.hyperindex.xyz/2d1cdb5/v1/graphql";
const execute = process.argv.includes("--execute");
const key = process.env["LIQUIDATOR_PRIVATE_KEY"];
const pythKey = process.env["PYTH_API_KEY"];
if (!(key && pythKey)) {
  throw new Error("Set LIQUIDATOR_PRIVATE_KEY and PYTH_API_KEY");
}

const account = privateKeyToAccount(key as Hex);
const transport = http();
const wallet = createWalletClient({ account, chain: monadTestnet, transport });
const runtime = createRuntime({
  chain: monadTestnet,
  transport,
  plugins: [
    perps({
      hermes: hermes({
        baseUrl: process.env["PYTH_HERMES_URL"] ?? "https://pyth.dourolabs.app/hermes",
        headers: { authorization: `Bearer ${pythKey}` },
      }),
    }),
  ],
});

const tournaments = await liveFuturesTournaments(
  INDEXER_URL,
  yotrade.perpsVenueAdapter,
  Math.floor(Date.now() / 1000),
);
const gas = await runtime.publicClient.getBalance({ address: account.address });
console.info(
  `liquidator ${account.address} · ${formatEther(gas)} MON · ${execute ? "EXECUTE" : "plan only"}`,
);
const result = await sweep(runtime.perps, execute ? wallet : null, tournaments, (line) =>
  console.info(`  ${line}`),
);
console.info(
  `${result.checked} accounts with positions, ${result.due} under maintenance, ${result.liquidated} liquidated, ${result.failed} failed`,
);
if (result.failed > 0) {
  process.exitCode = 1;
}
