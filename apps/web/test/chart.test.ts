import { describe, expect, test } from "bun:test";

import {
  areaPath,
  bookRows,
  candleShapes,
  linePath,
  plotOf,
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
