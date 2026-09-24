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
import { risk } from "../src/math.ts";
import { perps } from "../src/plugin.ts";

const INDEXER_URL =
  process.env["INDEXER_URL"] ?? "https://indexer.dev.hyperindex.xyz/d7c8bd4/v1/graphql";
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

interface Row {
  readonly id: string;
  readonly entries: readonly { readonly tradingAccount: Hex }[];
}

/** Running futures tournaments and who is in them. */
async function liveFuturesTournaments(): Promise<Row[]> {
  const now = Math.floor(Date.now() / 1000);
  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `query ($venue: String!, $now: numeric!) {
        Tournament(where: { status: { _eq: "OPEN" }, venue: { _eq: $venue }, startTime: { _lte: $now }, endTime: { _gt: $now } }) {
          id
          entries { tradingAccount }
        }
      }`,
      variables: { venue: yotrade.perpsVenueAdapter.toLowerCase(), now },
    }),
  });
  if (!response.ok) {
    throw new Error(`Indexer answered ${response.status}`);
  }
  const body = (await response.json()) as { data?: { Tournament: Row[] }; errors?: unknown };
  if (!body.data) {
    throw new Error(`Indexer query failed: ${JSON.stringify(body.errors)}`);
  }
  return body.data.Tournament;
}

const gas = await runtime.publicClient.getBalance({ address: account.address });
console.info(
  `liquidator ${account.address} · ${formatEther(gas)} MON · ${execute ? "EXECUTE" : "plan only"}`,
);

let checked = 0;
let due = 0;
for (const tournament of await liveFuturesTournaments()) {
  const id = BigInt(tournament.id);
  const cap = await runtime.perps.leverageCapOf(id);
  for (const { tradingAccount } of tournament.entries) {
    const open = await runtime.perps.account(id, tradingAccount);
    if (open.positions.length === 0) {
      continue;
    }
    checked += 1;
    const { prices } = await runtime.perps.latest(open.positions.map((p) => p.market));
    const valued = open.positions.map((p) => ({
      ...p,
      price: prices[p.market.toLowerCase() as Hex]?.price ?? p.entryPrice,
    }));
    const state = risk(open.balance, valued, cap);
    if (!state.liquidatable) {
      continue;
    }
    due += 1;
    console.info(
      `  ${tournament.id} ${tradingAccount} equity ${formatEther(state.equity)} notional ${formatEther(state.notional)} at ${cap}x`,
    );
    if (execute) {
      const hash = await runtime.perps.liquidate(wallet, {
        tournamentId: id,
        trader: tradingAccount,
      });
      console.info(`  ok   liquidated ${hash}`);
    }
  }
}
console.info(`${checked} accounts with positions, ${due} under maintenance`);
