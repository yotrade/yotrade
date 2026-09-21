import { createKuruClient } from "@toxicflow-labs/ts-sdk";
import { kuru as kuruAddresses, type MarketSymbol, markets, tokens } from "@yotrade/core/addresses";
import { definePlugin } from "@yotrade/core/plugin";
import {
  type Account,
  type Address,
  type Chain,
  type Hash,
  parseAbi,
  type Transport,
  type WalletClient,
  zeroAddress,
} from "viem";

import { createDataClient, type Fetch, KURU_TESTNET_DATA_URL } from "./data.ts";
import {
  EmptyBookError,
  NoKuruAccountError,
  PriceImpactError,
  TransactionRevertedError,
} from "./errors.ts";
import { parsePricePrecision, parseSwapQuote } from "./parse.ts";
import { type Book, minAmountOut, priceImpactBps, toBook, valueInQuote } from "./pricing.ts";

const faucetAbi = parseAbi([
  "function claim()",
  "function nextClaimAt(address account) view returns (uint64)",
]);

export type Wallet = WalletClient<Transport, Chain, Account>;

export interface KuruOptions {
  readonly dataUrl?: string;
  /** Test seam for the public data API. */
  readonly fetch?: Fetch;
}

export interface SwapRequest {
  readonly market: MarketSymbol;
  readonly side: "buy" | "sell";
  /** Quote-token units for a buy, base-token units for a sell. */
  readonly amountIn: bigint;
  /** Defaults to 50 (0.5%). */
  readonly slippageBps?: number;
  /** Seconds until the swap expires. Defaults to 60. */
  readonly ttlSeconds?: number;
  /** Refuse when the quote is this much worse than the top of the book. Defaults to 300 (3%). */
  readonly maxImpactBps?: number;
}

export interface SwapQuote {
  readonly quotedOut: bigint;
  /** See `priceImpactBps`. */
  readonly impactBps: number;
}

export const DEFAULT_MAX_IMPACT_BPS = 300;

export interface Holding {
  readonly free: bigint;
  readonly reserved: bigint;
  /** Value in USDC units at the current mid. Zero when the token has no liquid market. */
  readonly valueUsdc: bigint;
}

const NO_ACCOUNT = 0n;

/** USDC is its own unit of account; anything without a liquid market is worth zero for scoring. */
function usdcValue(
  symbol: string,
  amount: bigint,
  decimals: number,
  book: Book | undefined,
): bigint {
  if (symbol === "usdc") {
    return amount;
  }
  return book ? valueInQuote(amount, decimals, tokens.usdc.decimals, book) : 0n;
}

export function kuru(options: KuruOptions = {}) {
  return definePlugin("kuru", ({ publicClient }) => {
    const addresses = {
      accountCore: kuruAddresses.accountCore,
      spotRouter: kuruAddresses.spotRouter,
    };
    const reader = createKuruClient({ publicClient, addresses });
    const writer = (wallet: Wallet) =>
      createKuruClient({ publicClient, walletClient: wallet, account: wallet.account, addresses });
    const data = createDataClient(options.dataUrl ?? KURU_TESTNET_DATA_URL, options.fetch);

    /**
     * Monad has no global mempool, so the pending nonce lags: a transaction sent right after another one is
     * rejected ("An existing transaction had higher priority"). Every write therefore waits for its receipt.
     */
    async function confirm(pending: Promise<Hash>): Promise<Hash> {
      const hash = await pending;
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new TransactionRevertedError(hash);
      }
      return hash;
    }

    async function accountId(user: Address): Promise<bigint> {
      return BigInt(await reader.account.getAccountId({ user }));
    }

    async function book(market: MarketSymbol): Promise<Book> {
      const orderBook = markets[market].orderBook;
      const [params, [bid, ask]] = await Promise.all([
        reader.spot.getMarketParams({ market: orderBook }),
        reader.spot.bestBidAsk({ market: orderBook }),
      ]);
      return toBook(BigInt(bid), BigInt(ask), parsePricePrecision(params));
    }

    async function quote(
      request: Pick<SwapRequest, "market" | "side" | "amountIn">,
      userId?: bigint,
    ): Promise<SwapQuote> {
      const market = markets[request.market];
      const current = await book(request.market);
      if (!current.hasLiquidity) {
        throw new EmptyBookError(request.market);
      }
      const isBuy = request.side === "buy";
      const { amountOut } = parseSwapQuote(
        await reader.spot.estimateSwap({
          market: market.orderBook,
          // Fees depend on the account; an anonymous preview uses the default tier.
          userId: userId ?? NO_ACCOUNT,
          isBuy,
          amountIn: request.amountIn,
        }),
      );
      if (amountOut === 0n) {
        throw new EmptyBookError(request.market);
      }
      const impactBps = priceImpactBps(
        isBuy,
        request.amountIn,
        amountOut,
        tokens[market.base].decimals,
        tokens[market.quote].decimals,
        current,
      );
      return { quotedOut: amountOut, impactBps };
    }

    return {
      data,

      faucet: {
        /** Earliest time `user` may claim again, or `null` when a claim is possible now. */
        async nextClaimAt(user: Address): Promise<Date | null> {
          const next = await publicClient.readContract({
            address: kuruAddresses.faucet,
            abi: faucetAbi,
            functionName: "nextClaimAt",
            args: [user],
          });
          const at = Number(next) * 1000;
          return at > Date.now() ? new Date(at) : null;
        },

        /** Sends 10,000 USDC, 1 WETH, 0.1 cbBTC and 1 XAUt0 to the wallet. Twelve-hour cooldown. */
        claim(wallet: Wallet): Promise<Hash> {
          return confirm(
            wallet.writeContract({
              address: kuruAddresses.faucet,
              abi: faucetAbi,
              functionName: "claim",
            }),
          );
        },
      },

      account: {
        /** AccountCore id, or `0n` when the address has never deposited. */
        id: accountId,

        /** Moves `amount` of `token` from the wallet into Kuru, approving first when the allowance is short. */
        async deposit(wallet: Wallet, token: Address, amount: bigint): Promise<Hash> {
          const client = writer(wallet);
          if (token !== zeroAddress) {
            const allowance = await client.account.allowance({
              token,
              owner: wallet.account.address,
              spender: kuruAddresses.accountCore,
            });
            if (allowance < amount) {
              await confirm(
                client.account.approveErc20({ token, spender: kuruAddresses.accountCore, amount }),
              );
            }
          }
          return confirm(client.account.deposit({ token, amount }));
        },
      },

      market: {
        book,

        /** What a market order would get right now, and how far that is from the top of the book. */
        quote,

        /**
         * Market order. Refuses an empty book, a quote too far from the top of the book, and any fill worse
         * than the quote by more than the slippage tolerance.
         */
        async swap(
          wallet: Wallet,
          request: SwapRequest,
        ): Promise<{ hash: Hash; quotedOut: bigint }> {
          const userId = await accountId(wallet.account.address);
          if (userId === NO_ACCOUNT) {
            throw new NoKuruAccountError(wallet.account.address);
          }
          const { quotedOut, impactBps } = await quote(request, userId);
          const maxImpactBps = request.maxImpactBps ?? DEFAULT_MAX_IMPACT_BPS;
          if (impactBps > maxImpactBps) {
            throw new PriceImpactError(impactBps, maxImpactBps);
          }

          const hash = await confirm(
            writer(wallet).spot.swap({
              market: markets[request.market].orderBook,
              userId,
              isBuy: request.side === "buy",
              amountIn: request.amountIn,
              minAmountOut: minAmountOut(quotedOut, request.slippageBps ?? 50),
              deadline: BigInt(Math.floor(Date.now() / 1000) + (request.ttlSeconds ?? 60)),
            }),
          );
          return { hash, quotedOut };
        },
      },

      /** Free and reserved balances of every known token, each valued in USDC at the current mid. */
      async portfolio(
        user: Address,
      ): Promise<{ holdings: Record<string, Holding>; totalUsdc: bigint }> {
        const books = new Map<string, Book>();
        await Promise.all(
          (Object.keys(markets) as MarketSymbol[]).map(async (symbol) => {
            books.set(markets[symbol].base, await book(symbol));
          }),
        );

        const entries = await Promise.all(
          Object.entries(tokens).map(async ([symbol, token]) => {
            const [free, reserved] = await Promise.all([
              reader.account.getBalance({ user, token: token.address }),
              reader.account.getSpotReservedBalance({ user, token: token.address }),
            ]);
            const amount = free + reserved;
            const valueUsdc = usdcValue(symbol, amount, token.decimals, books.get(symbol));
            return [symbol, { free, reserved, valueUsdc }] as const;
          }),
        );

        const holdings = Object.fromEntries(entries);
        const totalUsdc = entries.reduce((sum, [, holding]) => sum + holding.valueUsdc, 0n);
        return { holdings, totalUsdc };
      },
    };
  });
}
