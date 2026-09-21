/** The Kuru SDK types some reads as `unknown`. These guards turn them into checked values at the boundary. */

function toBigInt(value: unknown, label: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  throw new TypeError(`Kuru SDK returned an unexpected ${label}: ${String(value)}`);
}

/** `getMarketParams` returns a tuple whose first element is the price precision. */
export function parsePricePrecision(params: unknown): bigint {
  if (!Array.isArray(params) || params.length === 0) {
    throw new TypeError("Kuru SDK returned unexpected market params");
  }
  const precision = toBigInt(params[0], "price precision");
  if (precision <= 0n) {
    throw new RangeError("Price precision must be positive");
  }
  return precision;
}

export interface SwapQuote {
  readonly amountInUsed: bigint;
  readonly amountOut: bigint;
}

export function parseSwapQuote(quote: unknown): SwapQuote {
  if (typeof quote !== "object" || quote === null) {
    throw new TypeError("Kuru SDK returned an unexpected swap quote");
  }
  const { amountInUsed, amountOut } = quote as Record<string, unknown>;
  return {
    amountInUsed: toBigInt(amountInUsed, "amountInUsed"),
    amountOut: toBigInt(amountOut, "amountOut"),
  };
}
