import { type Address, getAddress } from "viem";

import { type Bar, CANDLES, RANGES, type RangeName } from "./chart.ts";
import type { MarketSlug } from "./markets.ts";
import type { PerpsSlug } from "./perps-markets.ts";

/** One trader's fill, in display units. `trader` is the participant, the address the board lists. */
export interface RoomFill {
  readonly id: string;
  readonly trader: Address;
  readonly side: "buy" | "sell";
  readonly size: number;
  readonly price: number;
  readonly time: number;
}

/** A tournament's busiest market as its traders saw it: candles over the round, and their fills on them. */
export interface Room {
  readonly market: MarketSlug | PerpsSlug;
  /** Where the candles come from: Kuru's own book on Spot, a labelled reference series on Futures. */
  readonly source: string;
  readonly start: number;
  readonly end: number;
  /** Seconds per candle. */
  readonly step: number;
  readonly bars: Bar[];
  /** Newest first, in the chosen market and inside the window only. */
  readonly fills: RoomFill[];
}

const RANGE_ORDER: readonly RangeName[] = ["1s", "1m", "5m", "15m", "1h", "4h", "1D"];

/** The shortest timeframe whose `CANDLES` candles cover the whole round, so the chart shows it end to end. */
export function rangeFor(spanSeconds: number): RangeName {
  return (
    RANGE_ORDER.find((range) => RANGES[range].seconds * CANDLES >= spanSeconds) ??
    (RANGE_ORDER.at(-1) as RangeName)
  );
}

/** The market with the most fills; ties go to the one traded most recently, none to `fallback`. */
export function busiest<T extends string>(fills: readonly { market: T }[], fallback: T): T {
  const counts = new Map<T, number>();
  // Newest first, so the first market to reach a count is the most recently traded among equals.
  let best = fallback;
  let top = 0;
  for (const { market } of fills) {
    const count = (counts.get(market) ?? 0) + 1;
    counts.set(market, count);
    if (count > top) {
      best = market;
      top = count;
    }
  }
  return best;
}

/** The futures engine counts sizes and USD in 1e18. */
const WAD = 1e18;

/** A futures fill from the indexer, in display units; `entry_id` is `<tournament>-<participant>`. */
export function perpsFill(row: {
  id: string;
  entry_id: string;
  sizeDelta: bigint;
  price: bigint;
  timestamp: bigint;
}): RoomFill {
  return {
    id: row.id,
    trader: getAddress(row.entry_id.slice(row.entry_id.indexOf("-") + 1)),
    side: row.sizeDelta > 0n ? "buy" : "sell",
    size: Math.abs(Number(row.sizeDelta)) / WAD,
    price: Number(row.price) / WAD,
    time: Number(row.timestamp),
  };
}

