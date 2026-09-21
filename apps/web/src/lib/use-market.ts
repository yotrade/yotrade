"use client";

import { useQuery } from "@tanstack/react-query";

import { type MarketSymbol, markets } from "@yotrade/core/addresses";

import { bookRows, CANDLES, RANGES, type RangeName, summarize, toBars } from "./chart.ts";
import { roiBps } from "./ticket.ts";
import { useIdentity } from "./use-identity.tsx";
import { useRuntime } from "./use-runtime.ts";

const USDC = 1_000_000;

/** Everything the market screen shows, from Kuru's public APIs and the chain. */
export function useMarket(id: string, market: MarketSymbol, range: RangeName, needsDepth: boolean) {
  const { kuru, tournament } = useRuntime();
  const { identity } = useIdentity();
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
  });
  const candles = useQuery({
    queryKey: ["candles", orderBook, range],
    queryFn: async () => {
      const to = Math.floor(Date.now() / 1000);
      const from = to - RANGES[range].seconds * CANDLES;
      const rows = await kuru.data.candles(orderBook, {
        interval: RANGES[range].interval,
        from,
        countback: CANDLES,
      });
      return { from, to, rows };
    },
    refetchInterval: 10_000,
  });
  const depth = useQuery({
    queryKey: ["depth", info.data?.symbol],
    queryFn: () => (info.data ? kuru.data.depth(info.data.symbol, 12) : null),
    enabled: info.data !== undefined && needsDepth,
    refetchInterval: 3_000,
  });
  const portfolio = useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => (address ? kuru.portfolio(address) : null),
    enabled: address !== undefined,
    refetchInterval: 3_000,
  });

  const bars = info.data && candles.data ? toBars(candles.data.rows, info.data.pricePrecision) : [];
  const book =
    info.data && depth.data
      ? bookRows(depth.data, info.data.pricePrecision, info.data.sizePrecision)
      : { bids: [], asks: [] };

  return {
    wallet,
    base,
    joined: Boolean(wallet && entry.data),
    entryPending: entry.isPending,
    bars,
    from: candles.data?.from ?? 0,
    to: candles.data?.to ?? 1,
    summary: summarize(bars),
    book,
    roi: portfolio.data && entry.data ? roiBps(portfolio.data.totalUsdc, entry.data.capitalAtJoin) : null,
    positionUsd: portfolio.data ? Number(portfolio.data.holdings[base]?.valueUsdc ?? 0n) / USDC : null,
  };
}

export type MarketData = ReturnType<typeof useMarket>;
