import { formatUnits } from "viem";

import { minAmountOut } from "@yotrade/plugin-kuru/pricing";

export const SLIPPAGE_BPS = 50;
/** A swap's gas limit at testnet prices. Monad charges the limit, so this is what an order costs. */
export const NETWORK_FEE_MON = 0.05;

export interface OrderDetails {
  /** Quote units per one base unit for this size, after impact and fees. */
  readonly rate: number;
  readonly minimumReceived: bigint;
}

/**
 * What this exact order does: the price it gets and the least it can return. `amountIn` and `quotedOut` are in
 * the units of the token paid and the token received.
 */
export function orderDetails(
  isBuy: boolean,
  amountIn: bigint,
  quotedOut: bigint,
  decimalsIn: number,
  decimalsOut: number,
): OrderDetails {
  const paid = Number(formatUnits(amountIn, decimalsIn));
  const received = Number(formatUnits(quotedOut, decimalsOut));
  // Buying pays quote for base; selling pays base for quote. Either way the rate reads "quote per base".
  const rate = isBuy ? paid / received : received / paid;
  return {
    rate: Number.isFinite(rate) ? rate : 0,
    minimumReceived: minAmountOut(quotedOut, SLIPPAGE_BPS),
  };
}
