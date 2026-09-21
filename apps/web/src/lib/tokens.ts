import type { TokenSymbol } from "@yotrade/core/addresses";

/** How tokens are written in the interface. */
export const TOKEN_LABELS: Record<TokenSymbol, string> = {
  usdc: "USDC",
  cbBtc: "cbBTC",
  mon: "MON",
  xaut0: "XAUt0",
  weth: "WETH",
};

export const TOKEN_NAMES: Record<TokenSymbol, string> = {
  usdc: "USD Coin",
  cbBtc: "Coinbase Bitcoin",
  mon: "Monad",
  xaut0: "Tether Gold",
  weth: "Wrapped Ether",
};
