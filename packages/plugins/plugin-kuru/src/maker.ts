/** One resting limit order, in the market's own units. */
export interface MakerOrder {
  readonly side: "buy" | "sell";
  /** Price in price precision, a multiple of the tick size. */
  readonly price: bigint;
  /** Base quantity in size precision. */
  readonly quantity: bigint;
}

export interface MarketSpec {
  readonly pricePrecision: bigint;
  readonly sizePrecision: bigint;
  readonly tickSize: bigint;
  /** Smallest order the market accepts, in raw quote units (USDC, 6 decimals). */
  readonly minQuoteNotional: bigint;
}

export interface LadderRequest {
  /** Centre of the ladder, in price precision. */
  readonly reference: bigint;
  /** Distance of the first level from the reference, and between levels, in basis points. */
  readonly stepBps: bigint;
  readonly levels: number;
  /** Quote budget for the bid side, in raw USDC. */
  readonly quoteBudget: bigint;
  /** Base inventory for the ask side, in size precision. */
  readonly baseBudget: bigint;
}

const BPS = 10_000n;
const USDC = 1_000_000n;

/**
 * Bids below and asks above a reference price, evenly spaced, each side's budget split evenly across its levels.
 * Prices snap to the tick away from the reference, so the ladder never crosses itself. Levels that would fall
 * under the market's minimum notional are dropped rather than sent to revert.
 */
export function ladder(spec: MarketSpec, request: LadderRequest): MakerOrder[] {
  if (request.reference <= 0n || request.levels <= 0 || request.stepBps <= 0n) {
    throw new RangeError("A ladder needs a positive reference, step and level count");
  }
  const levels = BigInt(request.levels);
  const orders: MakerOrder[] = [];
  const notional = (price: bigint, quantity: bigint) =>
    (price * quantity * USDC) / (spec.pricePrecision * spec.sizePrecision);

  for (let level = 1n; level <= levels; level++) {
    const offset = (request.reference * request.stepBps * level) / BPS;

    const bid = ((request.reference - offset) / spec.tickSize) * spec.tickSize;
    if (bid > 0n) {
      const quote = request.quoteBudget / levels;
      const quantity = (quote * spec.pricePrecision * spec.sizePrecision) / (bid * USDC);
      if (quantity > 0n && notional(bid, quantity) >= spec.minQuoteNotional) {
        orders.push({ side: "buy", price: bid, quantity });
      }
    }

    // Round the ask up to the tick: down would move it toward the reference.
    const ask = ((request.reference + offset + spec.tickSize - 1n) / spec.tickSize) * spec.tickSize;
    const quantity = request.baseBudget / levels;
    if (quantity > 0n && notional(ask, quantity) >= spec.minQuoteNotional) {
      orders.push({ side: "sell", price: ask, quantity });
    }
  }
  return orders;
}
