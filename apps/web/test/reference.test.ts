import { describe, expect, test } from "bun:test";

import { createReference, parseBinance, parseGate } from "../src/server/reference.ts";

// Rows captured from the live APIs.
const BINANCE = [
  [
    1789995600000,
    "85323.00000000",
    "85845.27000000",
    "84778.00000000",
    "85466.34000000",
    "2331.00479000",
    1789999199999,
    "198724171.36428840",
    33065,
  ],
];
const GATE = [
  [
    "1789995600",
    "38410.23544000",
    "0.02596",
    "0.02619",
    "0.02555",
    "0.02615",
    "1483848.00000000",
    "true",
  ],
];

describe("reference prices", () => {
  test("normalises Binance klines: milliseconds to seconds, quote volume", () => {
    expect(parseBinance(BINANCE)).toEqual([
      {
        time: 1789995600,
        open: 85323,
        high: 85845.27,
        low: 84778,
        close: 85466.34,
        volume: 198724171.3642884,
      },
    ]);
  });

  test("normalises Gate candles, whose columns run close, high, low, open", () => {
    expect(parseGate(GATE)).toEqual([
      {
        time: 1789995600,
        open: 0.02615,
        high: 0.02619,
        low: 0.02555,
        close: 0.02596,
        volume: 38410.23544,
      },
    ]);
  });

  test("drops malformed rows and rejects anything that is not a list", () => {
    expect(parseBinance([[1, "x", "2", "1", "2", "0", 0, "0"]])).toEqual([]);
    expect(() => parseGate({ message: "rate limited" })).toThrow();
  });

  test("routes each market to its venue, and caches for thirty seconds", async () => {
    const urls: string[] = [];
    let time = 1_000_000;
    const reference = createReference(
      (url) => {
        urls.push(url);
        return Promise.resolve(
          new Response(JSON.stringify(url.includes("gateio") ? GATE : BINANCE)),
        );
      },
      () => time,
    );
    const gold = await reference("xaut0", "15m");
    expect(gold.label).toContain("PAXG");
    expect(gold.to - gold.from).toBe(384 * 900);
    await reference("xaut0", "15m");
    await reference("mon", "1s");
    expect(urls).toEqual([
      "https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=15m&limit=384",
      // Gate has no one-second candle, so the shortest timeframe falls back to ten seconds.
      "https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=MON_USDT&interval=10s&limit=384",
    ]);
    time += 30_000;
    await reference("xaut0", "15m");
    expect(urls).toHaveLength(3);
  });

  test("a bounded series ends where it is asked to, on both venues", async () => {
    const urls: string[] = [];
    const reference = createReference((url) => {
      urls.push(url);
      return Promise.resolve(new Response(JSON.stringify(url.includes("gateio") ? GATE : BINANCE)));
    });
    const eth = await reference("eth", "1m", 1_790_000_000);
    expect([eth.from, eth.to]).toEqual([1_790_000_000 - 384 * 60, 1_790_000_000]);
    await reference("mon", "1m", 1_790_000_000);
    expect(urls).toEqual([
      "https://data-api.binance.vision/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=384&endTime=1790000000000",
      "https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=MON_USDT&interval=1m&from=1789976960&to=1790000000",
    ]);
  });

  test("surfaces an upstream failure instead of caching it", async () => {
    const reference = createReference(() => Promise.resolve(new Response("{}", { status: 429 })));
    await expect(reference("cbbtc", "1h")).rejects.toThrow("429");
  });
});
