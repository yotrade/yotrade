import type { Depth } from "@yotrade/plugin-kuru/data";
import { parseUnits } from "viem";

export type TicketResult =
  | { readonly ok: true; readonly amount: bigint }
  | { readonly ok: false; readonly reason: string };

/** Turns what the trader typed into token units, or says why it cannot be traded. */
export function parseTicket(
  input: string,
  decimals: number,
  available: bigint,
  minimum?: { readonly amount: bigint; readonly label: string },
): TicketResult {
  const text = input.trim();
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") {
    return { ok: false, reason: "Enter an amount" };
  }
  if ((text.split(".")[1]?.length ?? 0) > decimals) {
    return { ok: false, reason: `At most ${decimals} decimals` };
  }
  const amount = parseUnits(text, decimals);
  if (amount === 0n) {
    return { ok: false, reason: "Enter an amount" };
  }
  if (amount > available) {
    return { ok: false, reason: "More than you have available" };
  }
  if (minimum && amount < minimum.amount) {
    return { ok: false, reason: `Minimum order is ${minimum.label}` };
  }
  return { ok: true, amount };
}

/** ROI in basis points, rounded toward zero. `null` when there is no capital to compare against. */
export function roiBps(value: bigint, capital: bigint): number | null {
  return capital === 0n ? null : Number(((value - capital) * 10_000n) / capital);
}

export function formatBps(bps: number): string {
  return `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(2)}%`;
}

/** Decimals a person would type for this token: cents for a dollar token, six at most for the rest. */
const inputDecimals = (decimals: number, isDollar: boolean) => (isDollar ? 2 : Math.min(decimals, 6));

/**
 * `percent` of `available` as text for the amount field, rounded **down** so that MAX can never exceed the
 * balance, and without trailing zeros.
 */
export function shortcutAmount(
  available: bigint,
  percent: bigint,
  decimals: number,
  isDollar: boolean,
  cap?: bigint,
): string {
  const share = (available * percent) / 100n;
  return amountText(cap !== undefined && cap < share ? cap : share, decimals, isDollar);
}

/** An amount as text for the amount field, rounded **down** and without trailing zeros. */
export function amountText(value: bigint, decimals: number, isDollar: boolean): string {
  const step = 10n ** BigInt(decimals - inputDecimals(decimals, isDollar));
  const amount = (value / step) * step;
  const whole = amount / 10n ** BigInt(decimals);
  const fraction = (amount % 10n ** BigInt(decimals)).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction === "" ? whole.toString() : `${whole}.${fraction}`;
}

/**
 * How much of the paid token the book absorbs within `maxImpactBps` of the top: every level priced inside that
 * band, summed. A buy pays quote and walks the asks; a sell pays base and walks the bids. Zero when the side is
 * empty. Prices are in price precision and sizes in size precision, as the depth feed gives them.
 */
export function fillableWithin(
  depth: Depth,
  isBuy: boolean,
  maxImpactBps: number,
  units: {
    readonly pricePrecision: bigint;
    readonly sizePrecision: bigint;
    readonly baseDecimals: number;
    readonly quoteDecimals: number;
  },
): bigint {
  const levels = isBuy ? depth.asks : depth.bids;
  const top = levels[0]?.price;
  if (top === undefined) {
    return 0n;
  }
  const limit = (top * BigInt(isBuy ? 10_000 + maxImpactBps : 10_000 - maxImpactBps)) / 10_000n;
  let total = 0n;
  for (const level of levels) {
    if (isBuy ? level.price > limit : level.price < limit) {
      break;
    }
    total += isBuy
      ? (level.price * level.size * 10n ** BigInt(units.quoteDecimals)) /
        (units.pricePrecision * units.sizePrecision)
      : (level.size * 10n ** BigInt(units.baseDecimals)) / units.sizePrecision;
  }
  return total;
}
