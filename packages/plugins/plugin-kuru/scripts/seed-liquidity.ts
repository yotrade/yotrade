/**
 * Rests two-sided limit orders on Kuru's testnet books, so tournaments and demos always have something to trade
 * against. Testnet books are thin enough that one order can clear a side.
 *
 *   bun run seed             # plan only: prints balances and the orders it would place
 *   bun run seed --execute   # claims the faucet, deposits, cancels the maker's old orders, places the ladder
 *
 * Needs MAKER_PRIVATE_KEY (a dedicated testnet account with a little MON for gas).
 */
import { createKuruClient } from "@toxicflow-labs/ts-sdk";
import { kuru as kuruAddresses, type MarketSymbol, markets, tokens } from "@yotrade/core/addresses";
import { createRuntime } from "@yotrade/core/plugin";
import {
  createWalletClient,
  erc20Abi,
  formatEther,
  formatUnits,
  type Hash,
  type Hex,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

import { ladder } from "../src/maker.ts";
import { kuru } from "../src/plugin.ts";

/** Markets the faucet gives inventory for, with the global pair used when a book has no usable mid. */
const TARGETS: { market: MarketSymbol; binance: string }[] = [
  { market: "XAUt0/USDC", binance: "PAXGUSDT" },
  { market: "cbBTC/USDC", binance: "BTCUSDT" },
];
const LEVELS = 8;
const STEP_BPS = 15n;
/** Half of one faucet claim per market, so a day of inventory rests on both books. */
const QUOTE_PER_MARKET = 5_000_000_000n;
const MIN_GAS = parseEther("0.3");

const execute = process.argv.includes("--execute");
const key = process.env["MAKER_PRIVATE_KEY"];
if (!key) {
  throw new Error("Set MAKER_PRIVATE_KEY to a dedicated testnet account");
}

const runtime = createRuntime({ chain: monadTestnet, transport: http(), plugins: [kuru()] });
const { publicClient } = runtime;
const account = privateKeyToAccount(key as Hex);
const wallet = createWalletClient({ account, chain: monadTestnet, transport: http() });
const client = createKuruClient({
  publicClient,
  walletClient: wallet,
  account,
  addresses: { accountCore: kuruAddresses.accountCore, spotRouter: kuruAddresses.spotRouter },
});

/** Monad's pending nonce lags, so every write waits for its receipt before the next one is sent. */
async function confirm(label: string, pending: Promise<Hash>): Promise<void> {
  const hash = await pending;
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.info(`${receipt.status === "success" ? "ok  " : "FAIL"} ${label} ${hash}`);
  if (receipt.status !== "success") {
    throw new Error(`${label} reverted`);
  }
}

async function globalPrice(symbol: string): Promise<number> {
  const response = await fetch(
    `https://data-api.binance.vision/api/v3/ticker/price?symbol=${symbol}`,
  );
  return Number(((await response.json()) as { price: string }).price);
}

const gas = await publicClient.getBalance({ address: account.address });
console.info(
  `maker ${account.address} · ${formatEther(gas)} MON · ${execute ? "EXECUTE" : "plan only"}`,
);
if (execute && gas < MIN_GAS) {
  throw new Error(`The maker needs at least ${formatEther(MIN_GAS)} MON for gas`);
}

if (execute && (await runtime.kuru.faucet.nextClaimAt(account.address)) === null) {
  await confirm("faucet claim", runtime.kuru.faucet.claim(wallet));
}
for (const symbol of ["usdc", "cbBtc", "xaut0"] as const) {
  const token = tokens[symbol];
  const balance = await publicClient.readContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.info(`wallet ${symbol}: ${formatUnits(balance, token.decimals)}`);
  if (execute && balance > 0n) {
    await runtime.kuru.account.deposit(wallet, token.address, balance);
    console.info(`ok   deposited ${symbol}`);
  }
}

const userId = await runtime.kuru.account.id(account.address);

for (const target of TARGETS) {
  const market = markets[target.market];
  // Yesterday's ladder still holds the inventory. Free it first, or the plan sees no base to sell.
  if (execute && userId !== 0n) {
    await confirm(
      "cancel old orders",
      client.spot.cancelAllOrders({ market: market.orderBook, userId }),
    );
  }
  const { holdings } = await runtime.kuru.portfolio(account.address);
  const [info, book] = await Promise.all([
    runtime.kuru.data.market(market.orderBook),
    runtime.kuru.market.book(target.market),
  ]);
  // A two-sided book has a mid worth keeping. Otherwise the ladder is centred on the real-world price.
  const reference = book.hasLiquidity
    ? (book.bid + book.ask) / 2n
    : BigInt(Math.round((await globalPrice(target.binance)) * Number(info.pricePrecision)));
  const base = holdings[market.base];
  const quote = holdings["usdc"];
  const baseDecimals = BigInt(tokens[market.base].decimals);
  // Inventory is in token decimals; order quantities are in the market's size precision.
  const baseBudget = ((base?.free ?? 0n) * info.sizePrecision) / 10n ** baseDecimals;
  const quoteBudget =
    (quote?.free ?? 0n) < QUOTE_PER_MARKET ? (quote?.free ?? 0n) : QUOTE_PER_MARKET;

  const orders = ladder(info, {
    reference,
    stepBps: STEP_BPS,
    levels: LEVELS,
    quoteBudget,
    baseBudget,
  });
  console.info(
    `\n${target.market} · reference ${Number(reference) / Number(info.pricePrecision)} (${book.hasLiquidity ? "book mid" : "global"}) · ${orders.length} orders`,
  );
  for (const order of orders) {
    console.info(
      `  ${order.side.padEnd(4)} ${(Number(order.quantity) / Number(info.sizePrecision)).toFixed(6)} @ ${Number(order.price) / Number(info.pricePrecision)}`,
    );
  }
  if (!execute || orders.length === 0 || userId === 0n) {
    continue;
  }
  await confirm(
    "place ladder",
    client.spot.batch({
      market: market.orderBook,
      userId,
      orders: orders.map((order) => ({ ...order, tif: "gtc", executionInstruction: "postOnly" })),
      cancelSlotIdxs: [],
    }),
  );
  const after = await runtime.kuru.market.book(target.market);
  console.info(
    `  book now ${Number(after.bid) / Number(info.pricePrecision)} / ${Number(after.ask) / Number(info.pricePrecision)}`,
  );
}
