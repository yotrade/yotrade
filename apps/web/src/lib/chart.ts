import type { Candle, Depth } from "@yotrade/plugin-kuru/data";

/** A candle in display units: prices as decimals, volume in whole USDC. */
export interface Bar {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** Candles per chart. Ninety-six 15-minute candles are exactly one day. */
export const CANDLES = 96;
/** How many candles are kept behind the default view, for zooming out and panning back. */
export const MAX_CANDLES = 384;
/** How far back the newest candles may come from. Thirty days covers any lull on testnet. */
export const LOOKBACK_SECONDS = 30 * 86_400;

/**
 * Candle timeframes, the way a trading screen offers them. `kuru` is the nearest interval Kuru's API serves;
 * `seconds` is the length of one candle at that interval, so the window is always `CANDLES` real candles wide.
 */
export const RANGES = {
  "1s": { interval: "1s", seconds: 1 },
  "1m": { interval: "1m", seconds: 60 },
  "5m": { interval: "5m", seconds: 300 },
  "15m": { interval: "5m", seconds: 900 },
  "1h": { interval: "1h", seconds: 3_600 },
  "4h": { interval: "1h", seconds: 14_400 },
  "1D": { interval: "1d", seconds: 86_400 },
} as const;
export type RangeName = keyof typeof RANGES;

/** Candles first: it is what a trader expects to open on. */
export const CHART_TYPES = ["Candles", "Line", "Area"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

const USDC = 1_000_000;

export function toBars(candles: readonly Candle[], pricePrecision: bigint): Bar[] {
  const scale = Number(pricePrecision);
  return candles.map((candle) => ({
    time: candle.time,
    open: Number(candle.open) / scale,
    high: Number(candle.high) / scale,
    low: Number(candle.low) / scale,
    close: Number(candle.close) / scale,
    volume: Number(candle.volumeUsdc) / USDC,
  }));
}

export interface Summary {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  /** Close against open, in basis points. */
  readonly changeBps: number;
}

export function summarize(bars: readonly Bar[]): Summary | null {
  const first = bars[0];
  const last = bars.at(-1);
  if (!first || !last) {
    return null;
  }
  return {
    open: first.open,
    high: Math.max(...bars.map((bar) => bar.high)),
    low: Math.min(...bars.map((bar) => bar.low)),
    close: last.close,
    volume: bars.reduce((sum, bar) => sum + bar.volume, 0),
    changeBps: first.open === 0 ? 0 : Math.round(((last.close - first.open) / first.open) * 10_000),
  };
}

export interface Frame {
  readonly width: number;
  readonly height: number;
  /** Room for the callouts above and below the plot. */
  readonly padY: number;
  /** Room at both ends, so a candle on the first or last tick is drawn whole. */
  readonly padX?: number;
}

export interface Plot {
  x(time: number): number;
  y(price: number): number;
  readonly min: number;
  readonly max: number;
}

/**
 * Maps time and price onto the frame. Thin markets trade rarely, so the time axis always runs from the start
 * of the range to now: a single old trade is a flat line to the right edge, not a dot.
 */
export function plotOf(bars: readonly Bar[], from: number, to: number, frame: Frame): Plot {
  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);
  let max = Math.max(...highs);
  let min = Math.min(...lows);
  if (max === min) {
    // A flat series still needs a band to sit in.
    max += Math.abs(max) * 0.001 || 1;
    min -= Math.abs(min) * 0.001 || 1;
  }
  const span = Math.max(1, to - from);
  const padX = frame.padX ?? 0;
  const plotWidth = frame.width - 2 * padX;
  const plotHeight = frame.height - 2 * frame.padY;
  return {
    min,
    max,
    x: (time) => padX + ((Math.min(Math.max(time, from), to) - from) / span) * plotWidth,
    y: (price) => frame.padY + (1 - (price - min) / (max - min)) * plotHeight,
  };
}

/**
 * One bar per `step` seconds for the last `count` slots ending at `end`, the way every charting tool draws a
 * thin market: fills that fall in a slot merge into its candle, and a slot without a fill is a flat candle at
 * the last known price. Timeframes then mean what they say, and an old outlier drops out of a short window.
 * Nothing is drawn before the first fill ever, and nothing at all when there is none.
 */
export function fillGaps(bars: readonly Bar[], step: number, end: number, count: number): Bar[] {
  const sorted = [...bars].sort((a, b) => a.time - b.time);
  const last = sorted.at(-1);
  if (!last) {
    return [];
  }
  const lastSlot = Math.floor(end / step) * step;
  const firstFill = sorted[0] ? Math.floor(sorted[0].time / step) * step : lastSlot;
  const firstSlot = Math.max(lastSlot - (count - 1) * step, Math.min(firstFill, lastSlot));
  // The price carried into the window: the latest fill before it, or the first fill ever.
  let close = sorted[0]?.open ?? 0;
  for (const bar of sorted) {
    if (bar.time >= firstSlot) {
      break;
    }
    close = bar.close;
  }
  const out: Bar[] = [];
  let index = sorted.findIndex((bar) => bar.time >= firstSlot);
  for (let slot = firstSlot; slot <= lastSlot; slot += step) {
    let merged: Bar | null = null;
    while (index !== -1 && index < sorted.length) {
      const bar = sorted[index];
      if (!bar || bar.time >= slot + step) {
        break;
      }
      merged = merged
        ? {
            time: slot,
            open: merged.open,
            high: Math.max(merged.high, bar.high),
            low: Math.min(merged.low, bar.low),
            close: bar.close,
            volume: merged.volume + bar.volume,
          }
        : { ...bar, time: slot };
      index += 1;
    }
    if (merged) {
      close = merged.close;
      out.push(merged);
    } else {
      out.push({ time: slot, open: close, high: close, low: close, close, volume: 0 });
    }
  }
  return out;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Step line: the price holds until the next trade and then jumps, which is what happened. A slope between two
 * trades hours apart would draw prices nobody ever traded at. Carried flat to `to` to reach the right edge.
 */
export function linePath(bars: readonly Bar[], plot: Plot, to: number): string {
  const first = bars[0];
  const last = bars.at(-1);
  if (!first || !last) {
    return "";
  }
  let d = `M${round(plot.x(first.time))} ${round(plot.y(first.close))}`;
  for (const bar of bars.slice(1)) {
    d += `H${round(plot.x(bar.time))}V${round(plot.y(bar.close))}`;
  }
  return `${d}H${round(plot.x(to))}`;
}

export function areaPath(bars: readonly Bar[], plot: Plot, to: number, frame: Frame): string {
  const first = bars[0];
  if (!first) {
    return "";
  }
  return `${linePath(bars, plot, to)}V${frame.height}H${round(plot.x(first.time))}Z`;
}

export interface CandleShape {
  /** The bar it draws: unique, unlike a rounded x. */
  readonly time: number;
  readonly x: number;
  readonly wickTop: number;
  readonly wickBottom: number;
  readonly bodyTop: number;
  readonly bodyHeight: number;
  readonly width: number;
  readonly up: boolean;
}

export function candleShapes(bars: readonly Bar[], plot: Plot, frame: Frame): CandleShape[] {
  const width = Math.max(3, Math.min(10, (frame.width / Math.max(bars.length, 24)) * 0.6));
  return bars.map((bar) => {
    const top = plot.y(Math.max(bar.open, bar.close));
    const bottom = plot.y(Math.min(bar.open, bar.close));
    return {
      time: bar.time,
      x: round(plot.x(bar.time)),
      wickTop: round(plot.y(bar.high)),
      wickBottom: round(plot.y(bar.low)),
      bodyTop: round(top),
      // A doji still gets a visible body.
      bodyHeight: round(Math.max(1.5, bottom - top)),
      width: round(width),
      up: bar.close >= bar.open,
    };
  });
}

export interface BookRow {
  readonly price: number;
  readonly size: number;
  /** Running total from the best price outward, in base units. */
  readonly cumulative: number;
  /** `cumulative` as a share of the deeper side, for the bar behind the row. */
  readonly share: number;
}

/** Both sides best-first, with running totals on one common scale so the bars are comparable. */
export function bookRows(depth: Depth, pricePrecision: bigint, sizePrecision: bigint) {
  const side = (levels: Depth["bids"]) => {
    let running = 0;
    return levels.map((level) => {
      const size = Number(level.size) / Number(sizePrecision);
      running += size;
      return { price: Number(level.price) / Number(pricePrecision), size, cumulative: running };
    });
  };
  const bids = side(depth.bids);
  const asks = side(depth.asks);
  const deepest = Math.max(bids.at(-1)?.cumulative ?? 0, asks.at(-1)?.cumulative ?? 0, Number.EPSILON);
  const share = (rows: typeof bids): BookRow[] =>
    rows.map((row) => ({ ...row, share: row.cumulative / deepest }));
  return { bids: share(bids), asks: share(asks) };
}

/** Fewer trades than this in the window and a percentage says more about one fill than about the market. */
export const QUIET_TRADES = 4;

/** True when too few slots actually traded for the line or its change to mean anything. */
export function isQuiet(bars: readonly Bar[]): boolean {
  return bars.filter((bar) => bar.volume > 0).length < QUIET_TRADES;
}

/** How far the window moved, first open to last close: in price and in basis points. */
export function changeOf(bars: readonly Bar[]): { amount: number; bps: number } | null {
  const first = bars[0];
  const last = bars.at(-1);
  if (!(first && last) || first.open === 0) {
    return null;
  }
  const amount = last.close - first.open;
  return { amount, bps: Math.round((amount / first.open) * 10_000) };
}

/** A window's length the way a price tag says it: 24H, 4D. */
export function spanText(seconds: number): string {
  const hours = Math.round(seconds / 3_600);
  return hours < 48 ? `${Math.max(hours, 1)}H` : `${Math.round(hours / 24)}D`;
}
