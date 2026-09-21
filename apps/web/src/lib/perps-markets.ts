import { type PerpsMarketSymbol, pyth } from "@yotrade/core/addresses";
import type { Hex } from "viem";

/** Futures markets by URL slug. The slugs never collide with the spot ones, so a URL names its venue. */
export const PERPS_MARKETS = {
  btc: { symbol: "BTC/USD", name: "Bitcoin", label: "BTC", glyph: "₿", tint: "#f7931a" },
  eth: { symbol: "ETH/USD", name: "Ethereum", label: "ETH", glyph: "Ξ", tint: "#627eea" },
  sol: { symbol: "SOL/USD", name: "Solana", label: "SOL", glyph: "◎", tint: "#9945ff" },
} as const satisfies Record<
  string,
  { symbol: PerpsMarketSymbol; name: string; label: string; glyph: string; tint: string }
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
