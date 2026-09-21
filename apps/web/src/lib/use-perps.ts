"use client";

import { useQuery } from "@tanstack/react-query";
import { type Risk, risk, type Valued } from "@yotrade/plugin-perps/math";
import type { Address, Hex } from "viem";

import { useRuntime } from "./use-runtime.ts";

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
      const account = await perps.account(BigInt(id), trader);
      const ids = [...new Set([...watch, ...account.positions.map((p) => p.market)])];
      const latest = ids.length > 0 ? (await perps.latest(ids)).prices : {};
      const prices = Object.fromEntries(
        Object.entries(latest).map(([feed, quote]) => [feed, quote.price]),
      ) as Record<Hex, bigint>;
      const positions = account.positions.map((p) => ({
        ...p,
        price: prices[p.market.toLowerCase() as Hex] ?? p.entryPrice,
      }));
      return { balance: account.balance, positions, prices, risk: risk(account.balance, positions) };
    },
  });
}
