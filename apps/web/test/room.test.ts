import { describe, expect, test } from "bun:test";

import { busiest, perpsFill, rangeFor } from "../src/lib/room.ts";

describe("the tournament room", () => {
  test("picks the shortest timeframe that shows the whole round in 96 candles", () => {
    expect(rangeFor(90)).toBe("1s");
    expect(rangeFor(97)).toBe("1m");
    expect(rangeFor(2 * 3_600)).toBe("5m");
    expect(rangeFor(24 * 3_600)).toBe("15m");
    expect(rangeFor(7 * 86_400)).toBe("4h");
    // Longer than 96 days still gets the longest candle, not nothing.
    expect(rangeFor(400 * 86_400)).toBe("1D");
  });

  test("shows the busiest market, the most recent on a tie, and the fallback when nobody traded", () => {
    // Newest first, the way the fills arrive.
    expect(busiest([{ market: "mon" }, { market: "xaut0" }, { market: "xaut0" }], "cbbtc")).toBe(
      "xaut0",
    );
    expect(busiest([{ market: "mon" }, { market: "xaut0" }], "cbbtc")).toBe("mon");
    expect(busiest([], "mon")).toBe("mon");
  });

  test("reads a futures fill: the participant from the entry id, the side from the sign, 1e18 units", () => {
    const fill = perpsFill({
      id: "0xabc-4",
      entry_id: "21-0x1bc4d3c5168fb4c0aed0c4caeb30ef29414720cb",
      sizeDelta: -59_980_827_728_224_950n,
      price: 83_353_920_361_050_000_000_000n,
      timestamp: 1_790_244_698n,
    });
    expect(fill.trader).toBe("0x1BC4d3C5168FB4c0AEd0c4caeB30EF29414720cb");
    expect(fill.side).toBe("sell");
    expect(fill.size).toBeCloseTo(0.05998, 5);
    expect(fill.price).toBeCloseTo(83_353.92, 2);
    expect(fill.time).toBe(1_790_244_698);
  });
});
