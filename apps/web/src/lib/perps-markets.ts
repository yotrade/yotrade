import { type PerpsMarketSymbol, pyth } from "@yotrade/core/addresses";
import type { Hex } from "viem";

/** Futures markets by URL slug, each with its mark in `public/brands/<slug>.png`. Slugs never collide with spot. */
export const PERPS_MARKETS = {
  btc: { symbol: "BTC/USD", name: "Bitcoin", label: "BTC" },
  eth: { symbol: "ETH/USD", name: "Ethereum", label: "ETH" },
  sol: { symbol: "SOL/USD", name: "Solana", label: "SOL" },
} as const satisfies Record<
  string,
  { symbol: PerpsMarketSymbol; name: string; label: string }
>;

export type PerpsSlug = keyof typeof PERPS_MARKETS;
export const PERPS_SLUGS = Object.keys(PERPS_MARKETS) as PerpsSlug[];

export function isPerpsSlug(value: string): value is PerpsSlug {
  return Object.hasOwn(PERPS_MARKETS, value);
}

export const feedOf = (slug: PerpsSlug): Hex => pyth.feeds[PERPS_MARKETS[slug].symbol];

export function slugOfFeed(feed: string): PerpsSlug | undefined {
  return PERPS_SLUGS.find((slug) => feedOf(slug).toLowerCase() === feed.toLowerCase());
}

/** The engine counts USD in 1e18. Screens that already speak USDC (1e6) get it in their unit. */
export const toUsdc = (usd: bigint) => usd / 10n ** 12n;
