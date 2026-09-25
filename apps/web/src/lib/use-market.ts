"use client";

import { useQuery } from "@tanstack/react-query";

import { type MarketSymbol, markets } from "@yotrade/core/addresses";

import {
  bookRows,
  CANDLES,
  fillGaps,
  LOOKBACK_SECONDS,
  MAX_CANDLES,
  RANGES,
  type RangeName,
  summarize,
  toBars,
} from "./chart.ts";
import { useMyReturn } from "./use-leaderboard.ts";
import { useIdentity } from "./use-identity.tsx";
import { useRuntime } from "./use-runtime.ts";
import { useTradingWindow } from "./use-trading-window.ts";

/** Kuru serves at most 500 candles per call. */
const MAX_FILLS = 500;

/** Everything the market screen shows, from Kuru's public APIs and the chain. */
export function useMarket(id: string, market: MarketSymbol, range: RangeName, needsDepth: boolean) {
  const { kuru, tournament } = useRuntime();
  const { identity } = useIdentity();
  const window = useTradingWindow(id);
  const wallet = identity?.tournamentWallet(BigInt(id));
  const address = wallet?.account.address;
  const { orderBook, base } = markets[market];

  const entry = useQuery({
    queryKey: ["entry", id, address],
    queryFn: () => (address ? tournament.entry(BigInt(id), address) : null),
    enabled: address !== undefined,
  });
  const info = useQuery({
    queryKey: ["market-info", orderBook],
    queryFn: () => kuru.data.market(orderBook),
    staleTime: Number.POSITIVE_INFINITY,
    // Never refetched once known; after a failure it must be, or the book waits on it forever.
    refetchInterval: (query) => (query.state.status === "error" ? 10_000 : false),
  });
  const candles = useQuery({
    queryKey: ["candles", orderBook, range],
    queryFn: async () => {
      // The newest fills whenever they happened; the slots between them are filled in below.
      const to = Math.floor(Date.now() / 1000);
      const rows = await kuru.data.candles(orderBook, {
        interval: RANGES[range].interval,
        from: to - LOOKBACK_SECONDS,
        countback: MAX_FILLS,
      });
      return { rows, to };
    },
    refetchInterval: 10_000,
  });
  const depth = useQuery({
    queryKey: ["depth", info.data?.symbol],
    queryFn: () => (info.data ? kuru.data.depth(info.data.symbol, 12) : null),
    enabled: info.data !== undefined && needsDepth,
    refetchInterval: 3_000,
  });
  const top = useQuery({
    queryKey: ["book", market],
    queryFn: () => kuru.market.book(market),
    refetchInterval: 3_000,
  });
  const portfolio = useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => (address ? kuru.portfolio(address) : null),
    enabled: address !== undefined,
    refetchInterval: 3_000,
  });

  const chartFailed = info.isError || (candles.isError && !candles.data);
  const bookFailed = info.isError || (depth.isError && !depth.data);
  const roi = useMyReturn(id, address);
  const bars =
    info.data && candles.data
      ? fillGaps(
          toBars(candles.data.rows, info.data.pricePrecision),
          RANGES[range].seconds,
          candles.data.to,
          MAX_CANDLES,
        )
      : [];
  const book =
    info.data && depth.data
      ? bookRows(depth.data, info.data.pricePrecision, info.data.sizePrecision)
      : { bids: [], asks: [] };

  return {
    wallet,
    base,
    /** Symbol and precisions, once known. */
    info: info.data ?? null,
    joined: Boolean(wallet && entry.data),
    entryPending: entry.isPending,
    /** The chain did not answer about my entry: not the same as "not joined". */
    entryFailed: entry.isError,
    /** The book or the balance could not be read; the ticket would be guessing. */
    dataFailed: top.isError || portfolio.isError,
    phase: window.phase,
    opensIn: window.opensIn,
    /** A buy needs offers and a sell needs bids. Unknown until the book has loaded. */
    canBuy: top.data?.hasAsk ?? true,
    canSell: top.data?.hasBid ?? true,
    /** Kuru did not answer: not the same as a market with no trades or an empty book. */
    chartFailed,
    bookFailed,
    /** Nothing here may be read as "empty" before it has loaded. */
    chartLoading: !chartFailed && (info.isPending || candles.isPending),
    bookLoading: !bookFailed && (info.isPending || depth.isPending),
    bars,
    from: bars[0]?.time ?? 0,
    to: bars.at(-1)?.time ?? 1,
    // The headline and the stats describe the default view, not everything kept for zooming out.
    summary: summarize(bars.slice(-CANDLES)),
    book,
    roi,
    /** What I hold of the base token and its value at the book. Null until the balance has loaded. */
    holding: portfolio.data?.holdings[base] ?? null,
  };
}

export type MarketData = ReturnType<typeof useMarket>;
