import type { MarketSymbol } from "@yotrade/core/addresses";

/** URL slugs for markets. Order is the order of the list: deepest book first. */
export const MARKET_SLUGS = {
  xaut0: "XAUt0/USDC",
  mon: "MON/USDC",
  cbbtc: "cbBTC/USDC",
} as const satisfies Record<string, MarketSymbol>;

export type MarketSlug = keyof typeof MARKET_SLUGS;

export function isMarketSlug(value: string): value is MarketSlug {
  return Object.hasOwn(MARKET_SLUGS, value);
}
