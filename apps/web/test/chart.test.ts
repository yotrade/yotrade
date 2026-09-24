import { describe, expect, test } from "bun:test";

import {
  areaPath,
  bookRows,
  candleShapes,
  changeOf,
  fillGaps,
  isQuiet,
  linePath,
  plotOf,
  spanText,
  summarize,
  toBars,
} from "../src/lib/chart.ts";

const FRAME = { width: 300, height: 200, padY: 20 };
const BARS = toBars(
  [
    {
      time: 100,
      open: 337_499n,
      high: 340_891n,
      low: 337_499n,
      close: 340_000n,
      volumeUsdc: 40_000_000n,
    },
    {
      time: 400,
      open: 340_000n,
      high: 340_000n,
      low: 339_000n,
      close: 339_500n,
      volumeUsdc: 10_000_000n,
    },
  ],
  100n,
);

describe("chart", () => {
  test("scales candles to display units", () => {
    expect(BARS[0]).toEqual({
      time: 100,
      open: 3374.99,
      high: 3408.91,
      low: 3374.99,
      close: 3400,
      volume: 40,
    });
  });

  test("summarizes a range: first open, extremes, last close, volume and change", () => {
    expect(summarize(BARS)).toEqual({
      open: 3374.99,
      high: 3408.91,
      low: 3374.99,
      close: 3395,
      volume: 50,
      changeBps: 59,
    });
    expect(summarize([])).toBeNull();
  });

  test("puts the high at the top padding, the low at the bottom, and clamps time to the range", () => {
    const plot = plotOf(BARS, 0, 1_000, FRAME);
    expect(plot.y(3408.91)).toBeCloseTo(20);
    expect(plot.y(3374.99)).toBeCloseTo(180);
    expect(plot.x(500)).toBe(150);
    expect(plot.x(-50)).toBe(0);
    expect(plot.x(5_000)).toBe(300);
  });

  test("steps between trades and carries the last price to the right edge", () => {
    const plot = plotOf(BARS, 0, 1_000, FRAME);
    // Holds the first close until the second trade, jumps, then runs flat to now.
    expect(linePath(BARS, plot, 1_000)).toBe("M30 62.03H120V85.61H300");
    const single = BARS.slice(0, 1);
    const one = plotOf(single, 0, 1_000, FRAME);
    expect(linePath(single, one, 1_000)).toMatch(/^M30 [\d.]+H300$/);
    expect(areaPath(single, one, 1_000, FRAME)).toMatch(/H300V200H30Z$/);
    expect(linePath([], plot, 1_000)).toBe("");
  });

  test("keeps the ends inside the frame when there is horizontal padding", () => {
    const plot = plotOf(BARS, 0, 1_000, { ...FRAME, padX: 10 });
    expect(plot.x(0)).toBe(10);
    expect(plot.x(1_000)).toBe(290);
  });

  test("gives a flat series a band to sit in instead of dividing by zero", () => {
    const flat = toBars(
      [{ time: 1, open: 100n, high: 100n, low: 100n, close: 100n, volumeUsdc: 0n }],
      1n,
    );
    const plot = plotOf(flat, 0, 10, FRAME);
    expect(Number.isFinite(plot.y(100))).toBe(true);
    expect(plot.y(100)).toBeCloseTo(100);
  });

  test("draws candles with direction, and a doji still has a body", () => {
    const plot = plotOf(BARS, 0, 1_000, FRAME);
    const [up, down] = candleShapes(BARS, plot, FRAME);
    expect(up?.up).toBe(true);
    expect(down?.up).toBe(false);
    expect(up?.wickTop).toBeLessThanOrEqual(up?.bodyTop ?? 0);
    const doji = toBars([{ time: 1, open: 5n, high: 6n, low: 4n, close: 5n, volumeUsdc: 0n }], 1n);
    expect(candleShapes(doji, plotOf(doji, 0, 10, FRAME), FRAME)[0]?.bodyHeight).toBe(1.5);
  });

  test("book rows accumulate from the best price on a scale shared by both sides", () => {
    const rows = bookRows(
      {
        bids: [{ price: 337_499n, size: 2_000_000n }],
        asks: [
          { price: 340_891n, size: 1_000_000n },
          { price: 341_000n, size: 3_000_000n },
        ],
      },
      100n,
      1_000_000n,
    );
    expect(rows.asks.map((row) => row.cumulative)).toEqual([1, 4]);
    expect(rows.asks.at(-1)?.share).toBe(1);
    expect(rows.bids[0]).toEqual({ price: 3374.99, size: 2, cumulative: 2, share: 0.5 });
    expect(bookRows({ bids: [], asks: [] }, 1n, 1n)).toEqual({ bids: [], asks: [] });
  });
});

describe("fillGaps", () => {
  const fill = (time: number, close: number, open = close) => ({
    time,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    volume: 1,
  });

  test("one bar per slot: fills merge, empty slots hold the last price", () => {
    const bars = fillGaps(
      [fill(100, 10), fill(130, 12, 10), fill(140, 11), fill(400, 20)],
      60,
      419,
      6,
    );
    expect(bars.map((bar) => bar.time)).toEqual([60, 120, 180, 240, 300, 360]);
    expect(bars[0]).toMatchObject({ open: 10, close: 10, volume: 1 });
    // Two fills in the 120 slot become one candle: first open, last close, extremes, summed volume.
    expect(bars[1]).toMatchObject({ open: 10, high: 12, low: 10, close: 11, volume: 2 });
    expect(bars[2]).toMatchObject({ open: 11, high: 11, low: 11, close: 11, volume: 0 });
    expect(bars[5]).toMatchObject({ close: 20, volume: 1 });
  });

  test("a window after the last fill is flat at that fill; before any fill, nothing", () => {
    const flat = fillGaps([fill(100, 10)], 60, 1_000, 3);
    expect(flat.map((bar) => bar.close)).toEqual([10, 10, 10]);
    expect(flat.every((bar) => bar.volume === 0)).toBe(true);
    expect(fillGaps([], 60, 1_000, 3)).toEqual([]);
    // A long window starts at the first fill instead of inventing a flat past.
    const young = fillGaps([fill(1_000, 10), fill(1_100, 11)], 60, 1_199, 100);
    expect(young).toHaveLength(4);
    expect(young[0]?.time).toBe(960);
  });

  test("an old outlier leaves a short window and stays in a long one", () => {
    const bars = [fill(0, 100), fill(3_600, 50), fill(7_000, 100), fill(7_100, 101)];
    const short = fillGaps(bars, 60, 7_199, 4);
    expect(Math.min(...short.map((bar) => bar.low))).toBe(100);
    const long = fillGaps(bars, 3_600, 7_199, 3);
    expect(Math.min(...long.map((bar) => bar.low))).toBe(50);
  });
});

describe("isQuiet", () => {
  const bar = (volume: number) => ({ time: 0, open: 1, high: 1, low: 1, close: 1, volume });
  test("a market with a handful of traded slots is quiet, one that trades is not", () => {
    expect(isQuiet([])).toBe(true);
    expect(isQuiet([bar(1), bar(0), bar(2), bar(0), bar(1)])).toBe(true);
    expect(isQuiet([bar(1), bar(1), bar(1), bar(1)])).toBe(false);
  });
});

describe("changeOf", () => {
  const bar = (open: number, close: number) => ({
    time: 0,
    open,
    high: 0,
    low: 0,
    close,
    volume: 1,
  });
  test("first open to last close, in price and basis points", () => {
    const change = changeOf([bar(100, 90), bar(90, 98.59)]);
    expect(change?.amount).toBeCloseTo(-1.41);
    expect(change?.bps).toBe(-141);
    expect(changeOf([])).toBeNull();
    expect(changeOf([bar(0, 5)])).toBeNull();
  });
});

describe("spanText", () => {
  test("hours up to two days, then days", () => {
    expect(spanText(86_400)).toBe("24H");
    expect(spanText(96 * 3_600)).toBe("4D");
    expect(spanText(60)).toBe("1H");
  });
});
