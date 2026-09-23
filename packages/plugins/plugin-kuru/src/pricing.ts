/** `bestBidAsk` sentinel values for an empty side: bid is uint32 max, ask is zero. */
const EMPTY_BID = 4_294_967_295n;

export interface Book {
  /** Best bid in price-precision units. */
  readonly bid: bigint;
  /** Best ask in price-precision units. */
  readonly ask: bigint;
  /** Units per 1.0 of price, for example 100 means two decimals. */
  readonly pricePrecision: bigint;
  /** Someone is bidding: a sell can fill. */
  readonly hasBid: boolean;
  /** Someone is offering: a buy can fill. */
  readonly hasAsk: boolean;
  /** Both sides are quoted and not crossed. */
  readonly hasLiquidity: boolean;
}

export function toBook(bid: bigint, ask: bigint, pricePrecision: bigint): Book {
  const hasBid = bid > 0n && bid !== EMPTY_BID;
  const hasAsk = ask > 0n;
  return { bid, ask, pricePrecision, hasBid, hasAsk, hasLiquidity: hasBid && hasAsk && bid < ask };
}

/** Mid price as a decimal number, for display only. Never use it for accounting. */
export function midPrice(book: Book): number {
  return Number(book.bid + book.ask) / (2 * Number(book.pricePrecision));
}

/**
 * Value of `baseAmount` in quote-token units, rounded down. Marked at the mid when the book is two-sided, at
 * the best bid when only bids are left (what the inventory can still be sold for), and at the best ask when
 * only asks are left: buyers emptied the bids for a moment, not the token's worth. Zero when the book is empty.
 * Integer math throughout: value = amount × price × 10^quoteDecimals / (precision × 10^baseDecimals).
 */
export function valueInQuote(
  baseAmount: bigint,
  baseDecimals: number,
  quoteDecimals: number,
  book: Book,
): bigint {
  if (!(book.hasBid || book.hasAsk) || baseAmount === 0n) {
    return 0n;
  }
  // Twice the mark, so the mid needs no division before the final one.
  let twiceMark = 2n * book.ask;
  if (book.hasLiquidity) {
    twiceMark = book.bid + book.ask;
  } else if (book.hasBid) {
    twiceMark = 2n * book.bid;
  }
  const numerator = baseAmount * twiceMark * 10n ** BigInt(quoteDecimals);
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

/**
 * How much worse a quote is than trading the whole size at the top of the book, in basis points.
 * A buy is compared with the best ask, a sell with the best bid. Fees are part of the quote, so a small
 * positive number is normal; a large one means the order walks the book or fills only in part.
 */
export function priceImpactBps(
  isBuy: boolean,
  amountIn: bigint,
  quotedOut: bigint,
  baseDecimals: number,
  quoteDecimals: number,
  book: Book,
): number {
  const base = 10n ** BigInt(baseDecimals);
  const quote = 10n ** BigInt(quoteDecimals);
  const atTop = isBuy
    ? (amountIn * base * book.pricePrecision) / (book.ask * quote)
    : (amountIn * book.bid * quote) / (book.pricePrecision * base);
  if (atTop === 0n) {
    return 0;
  }
  return Math.max(0, Number(((atTop - quotedOut) * 10_000n) / atTop));
}
