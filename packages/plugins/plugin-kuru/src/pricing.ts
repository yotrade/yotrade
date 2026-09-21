/** `bestBidAsk` sentinel values for an empty side: bid is uint32 max, ask is zero. */
const EMPTY_BID = 4_294_967_295n;

export interface Book {
  /** Best bid in price-precision units. */
  readonly bid: bigint;
  /** Best ask in price-precision units. */
  readonly ask: bigint;
  /** Units per 1.0 of price, for example 100 means two decimals. */
  readonly pricePrecision: bigint;
  readonly hasLiquidity: boolean;
}

export function toBook(bid: bigint, ask: bigint, pricePrecision: bigint): Book {
  const hasLiquidity = bid > 0n && bid !== EMPTY_BID && ask > 0n && bid < ask;
  return { bid, ask, pricePrecision, hasLiquidity };
}

/** Mid price as a decimal number, for display only. Never use it for accounting. */
export function midPrice(book: Book): number {
  return Number(book.bid + book.ask) / (2 * Number(book.pricePrecision));
}

/**
 * Value of `baseAmount` in quote-token units at the mid price, rounded down.
 * Integer math throughout: value = amount × (bid + ask) × 10^quoteDecimals / (2 × precision × 10^baseDecimals).
 */
export function valueInQuote(
  baseAmount: bigint,
  baseDecimals: number,
  quoteDecimals: number,
  book: Book,
): bigint {
  if (!book.hasLiquidity || baseAmount === 0n) {
    return 0n;
  }
  const numerator = baseAmount * (book.bid + book.ask) * 10n ** BigInt(quoteDecimals);
  const denominator = 2n * book.pricePrecision * 10n ** BigInt(baseDecimals);
  return numerator / denominator;
}

/** Lowest acceptable output for a quoted amount, given a tolerance in basis points. */
export function minAmountOut(quotedOut: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new RangeError("slippageBps must be an integer in [0, 10000)");
  }
  return (quotedOut * BigInt(10_000 - slippageBps)) / 10_000n;
}
