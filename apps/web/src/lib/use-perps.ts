"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Risk, risk, type Valued } from "@yotrade/plugin-perps/math";
import type { Address, Hex } from "viem";

import { CANDLES, type RangeName, summarize } from "./chart.ts";
import { fundGas } from "./fund-gas.ts";
import { usdNumber } from "./perps-format.ts";
import { feedOf, type PerpsSlug } from "./perps-markets.ts";
import { useIdentity } from "./use-identity.tsx";
import { useReference } from "./use-reference.ts";
import { useRuntime } from "./use-runtime.ts";
import { useTradingWindow } from "./use-trading-window.ts";

export interface PerpsPosition extends Valued {
  readonly market: Hex;
}

export interface PerpsSnapshot {
  /** Cash, USD 1e18. */
  readonly balance: bigint;
  readonly positions: readonly PerpsPosition[];
  /** Newest price per requested or open market, USD 1e18. */
  readonly prices: Readonly<Record<Hex, bigint>>;
  readonly risk: Risk;
  /** The tournament's leverage cap: 5, 20 or 100. */
  readonly leverageCap: bigint;
}

/**
 * A futures account valued at live Pyth prices. `watch` adds markets without a position, so a screen gets the
 * price it shows and the account it trades from in one poll.
 */
export function usePerps(id: string, trader: Address | undefined, watch: readonly Hex[] = []) {
  const { perps } = useRuntime();
  return useQuery({
    queryKey: ["perps", id, trader, watch],
    enabled: trader !== undefined,
    refetchInterval: 2_000,
    queryFn: async (): Promise<PerpsSnapshot | null> => {
      if (!trader) {
        return null;
      }
      const [account, leverageCap] = await Promise.all([
        perps.account(BigInt(id), trader),
        perps.leverageCapOf(BigInt(id)),
      ]);
      const ids = [...new Set([...watch, ...account.positions.map((p) => p.market)])];
      const latest = ids.length > 0 ? (await perps.latest(ids)).prices : {};
      const prices = Object.fromEntries(
        Object.entries(latest).map(([feed, quote]) => [feed, quote.price]),
      ) as Record<Hex, bigint>;
      const positions = account.positions.map((p) => ({
        ...p,
        price: prices[p.market.toLowerCase() as Hex] ?? p.entryPrice,
      }));
      return {
        balance: account.balance,
        positions,
        prices,
        risk: risk(account.balance, positions, leverageCap),
        leverageCap,
      };
    },
  });
}

/** Everything one futures market screen shows, and the one action it owns besides the ticket. */
export function usePerpsMarket(id: string, slug: PerpsSlug, range: RangeName) {
  const { publicClient, perps, tournament } = useRuntime();
  const { identity } = useIdentity();
  const queryClient = useQueryClient();
  const window = useTradingWindow(id);
  const wallet = identity?.tournamentWallet(BigInt(id));
  const trader = wallet?.account.address;
  const feed = feedOf(slug);

  const entry = useQuery({
    queryKey: ["entry", id, trader],
    queryFn: () => (trader ? tournament.entry(BigInt(id), trader) : null),
    enabled: trader !== undefined,
  });
  const account = usePerps(id, trader, [feed]);
  const reference = useReference(slug, range);

  const price = account.data?.prices[feed.toLowerCase() as Hex];
  const position = account.data?.positions.find((p) => p.market.toLowerCase() === feed.toLowerCase());
  // The headline describes the default view; the rest of the series is there for zooming out.
  const summary = summarize((reference.data?.bars ?? []).slice(-CANDLES));
  let state: "loading" | "joined" | "out" | "failed" = entry.data ? "joined" : "out";
  if (entry.isPending) {
    state = "loading";
  } else if (entry.isError) {
    state = "failed";
  }

  return {
    wallet,
    state,
    phase: window.phase,
    opensIn: window.opensIn,
    account,
    reference,
    price,
    position,
    // The chart is a reference series; the headline is the price an order fills at.
    headline: summary && price ? { ...summary, close: usdNumber(price) } : summary,
    /** Market-closes the position. Throws when nothing filled. */
    async close(): Promise<void> {
      if (!(wallet && position)) {
        return;
      }
      await fundGas(publicClient, wallet.account.address);
      await perps.trade(wallet, { tournamentId: BigInt(id), market: feed, sizeDelta: -position.size });
      await queryClient.invalidateQueries({ queryKey: ["perps", id] });
    },
  };
}
