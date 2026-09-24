import { describe, expect, test } from "bun:test";

import { createDataClient, summarizeTrades } from "../src/data.ts";
import { parsePricePrecision, parseSwapQuote } from "../src/parse.ts";

const respond =
  (body: unknown, status = 200) =>
  (url: string) => {
    calls.push(url);
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
const calls: string[] = [];

describe("data client", () => {
  test("decodes balances into bigints", async () => {
    const client = createDataClient(
      "https://kuru.test/api/v1",
      respond({
        data: [
          { tokenAddress: "0xee07", total: "900000049", available: "900000000", reserved: "49" },
        ],
      }),
    );

    expect(await client.balances(80n)).toEqual([
      { token: "0xee07", total: 900_000_049n, available: 900_000_000n, reserved: 49n },
    ]);
    expect(calls.at(-1)).toBe("https://kuru.test/api/v1/users/80/balances");
  });

  test("reads current positions from one page of trades", async () => {
    const client = createDataClient(
      "https://kuru.test/api/v1",
      respond({
        data: {
          trades: [],
          positions: [{ marketAddress: "0x5bde", openSize: "97955", openCost: "99999951" }],
        },
      }),
    );

    expect(await client.positions(80n)).toEqual([
      { market: "0x5bde", openSize: 97_955n, openCost: 99_999_951n },
    ]);
    expect(calls.at(-1)).toBe("https://kuru.test/api/v1/users/80/trades?limit=1");
  });

  test("decodes trades with their running PnL", async () => {
    const client = createDataClient(
      "https://kuru.test/api/v1",
      respond({
        data: {
          trades: [
            {
              tradeId: "791",
              marketAddress: "0x5bde",
              symbol: "CBBTCUSDC",
              isBuy: true,
              isMaker: false,
              price: "10202644",
              filledSize: "32205",
              fees: { makerFee: "0", takerFee: "22995000000000000" },
              pnl: { realizedPnl: "0", openSize: "97955", openCost: "99999951" },
              blockTimestamp: 1_789_983_348,
              transactionHash: "0xa723",
            },
            // One order walking two levels: the API emits a partial record with no running position.
            {
              tradeId: "790",
              marketAddress: "0x5bde",
              symbol: "CBBTCUSDC",
              isBuy: true,
              isMaker: false,
              price: "10202644",
              filledSize: "65750",
              pnl: { realizedPnl: "0", openSize: null, openCost: null },
              blockTimestamp: 1_789_983_348,
              transactionHash: "0xa723",
            },
          ],
        },
      }),
    );

    const [trade, partial] = await client.trades(80n, 5);
    expect(trade).toMatchObject({
      price: 10_202_644n,
      openSize: 97_955n,
      openCost: 99_999_951n,
      feeUsdc: 22_995n,
      isBuy: true,
    });
    expect(partial).toMatchObject({ openSize: 0n, openCost: 0n, feeUsdc: 0n });
    expect(calls.at(-1)).toBe("https://kuru.test/api/v1/users/80/trades?limit=5");
  });

  test("surfaces HTTP errors instead of returning empty data", async () => {
    const client = createDataClient("https://kuru.test/api/v1", respond({}, 503));
    await expect(client.balances(80n)).rejects.toThrow(/503/);
  });
});

describe("SDK boundary parsers", () => {
  test("accept the shapes the SDK really returns", () => {
    expect(parsePricePrecision([100, 100_000_000n, 1])).toBe(100n);
    expect(parseSwapQuote({ amountInUsed: 99_999_951n, amountOut: 97_955n })).toEqual({
      amountInUsed: 99_999_951n,
      amountOut: 97_955n,
    });
  });

  test("reject anything else loudly", () => {
    expect(() => parsePricePrecision([])).toThrow(TypeError);
    expect(() => parsePricePrecision([0])).toThrow(RangeError);
    expect(() => parseSwapQuote(null)).toThrow(TypeError);
    expect(() => parseSwapQuote({ amountOut: "1" })).toThrow(TypeError);
  });
});

describe("performance", () => {
  const trade = (
    ts: number,
    realized: string,
    openSize: string | null,
    openCost: string | null = openSize,
  ) => ({
    marketAddress: "0x5bde",
    blockTimestamp: ts,
    pnl: { realizedPnl: realized, openSize, openCost },
  });

  test("reads every fill up to the end, realizes only inside the window, and pages", async () => {
    const urls: string[] = [];
    const pages = [
      {
        // Newest first. A sale after the end is not asked for: `to` is the end.
        data: { trades: [trade(150, "-35545101000000000000", "97955", "99999951")], positions: [] },
        pagination: { nextCursor: "abc" },
      },
      {
        data: {
          trades: [trade(120, "10000000000000000000", null), trade(90, "0", "5", "6")],
          positions: [],
        },
        pagination: { nextCursor: null },
      },
    ];
    const client = createDataClient("https://kuru.test/api/v1", (url) => {
      urls.push(url);
      return Promise.resolve(new Response(JSON.stringify(pages[urls.length - 1])));
    });

    expect(await client.performance(85n, { from: 100n, to: 200n })).toEqual({
      realizedUsdc: -25_545_101n,
      fills: 2,
      positions: [{ market: "0x5bde", openSize: 97_955n, openCost: 99_999_951n }],
    });
    expect(urls[0]).toBe("https://kuru.test/api/v1/users/85/trades?limit=500&from=0&to=200");
    expect(urls[1]).toContain("cursor=abc");
  });
});

describe("priceAt", () => {
  const candles = (t: number[], c: string[]) => ({
    data: { t, o: c, h: c, l: c, c, v: c.map(() => "0") },
  });

  test("the close of the last minute that ended by then, else of the last hour", async () => {
    const urls: string[] = [];
    const client = createDataClient("https://kuru.test/api/v1", (url) => {
      urls.push(url);
      const body = url.includes("interval=1h")
        ? candles([0, 3_600, 7_200], ["10", "11", "12"])
        : candles([7_200, 7_260, 7_320], ["20", "21", "22"]);
      return Promise.resolve(new Response(JSON.stringify(body)));
    });
    // 7,330: minutes 7,200 and 7,260 have ended, 7,320 has not.
    expect(await client.priceAt("0x5bde", 7_330)).toBe(21n);
    expect(urls.some((url) => url.includes("interval=1m") && url.includes("from=7200"))).toBe(true);
  });

  test("falls back to the last closed hour, and to null when nothing traded", async () => {
    const quiet = createDataClient("https://kuru.test/api/v1", (url) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url.includes("interval=1h") ? candles([0, 3_600], ["10", "11"]) : candles([], []),
          ),
        ),
      ),
    );
    expect(await quiet.priceAt("0x5bde", 7_300)).toBe(11n);
    expect(await quiet.priceAt("0x5bde", 3_000)).toBeNull();
  });
});

describe("summarizeTrades", () => {
  const row = (market: string, ts: number, openSize: string | null) => ({
    marketAddress: market as `0x${string}`,
    blockTimestamp: ts,
    pnl: { realizedPnl: "0", openSize, openCost: openSize },
  });

  test("the inventory is the newest record that carries it, per market", () => {
    const summary = summarizeTrades(
      [row("0xA", 30, null), row("0xA", 30, "0"), row("0xB", 20, "7"), row("0xA", 10, "9")],
      0n,
    );
    expect(summary.positions).toEqual([
      { market: "0xA", openSize: 0n, openCost: 0n },
      { market: "0xB", openSize: 7n, openCost: 7n },
    ]);
    expect(summary.fills).toBe(4);
  });

  test("no fills is no inventory and nothing realized", () => {
    expect(summarizeTrades([], 0n)).toEqual({ realizedUsdc: 0n, fills: 0, positions: [] });
  });
});

describe("market data", () => {
  test("decodes columnar candles, scaling volume to USDC units", async () => {
    const urls: string[] = [];
    const client = createDataClient("https://kuru.test/api/v1", (url) => {
      urls.push(url);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              t: [100, 400],
              o: ["337499", "340000"],
              h: ["340891", "340000"],
              l: ["337499", "339000"],
              c: ["340000", "339500"],
              v: ["1330230000000000000000", "0"],
            },
          }),
        ),
      );
    });
    const candles = await client.candles("0x0B4dD2A7b09d5c5401149fFe51301Cc589017343", {
      interval: "5m",
      from: 50,
      countback: 2,
    });
    expect(candles).toEqual([
      {
        time: 100,
        open: 337_499n,
        high: 340_891n,
        low: 337_499n,
        close: 340_000n,
        volumeUsdc: 1_330_230_000n,
      },
      { time: 400, open: 340_000n, high: 340_000n, low: 339_000n, close: 339_500n, volumeUsdc: 0n },
    ]);
    expect(urls[0]).toBe(
      "https://kuru.test/api/v1/markets/0x0b4dd2a7b09d5c5401149ffe51301cc589017343/candles?interval=5m&from=50&countback=2",
    );
  });

  test("reads depth from the gateway and market details from the data API", async () => {
    const urls: string[] = [];
    const client = createDataClient(
      "https://kuru.test/api/v1",
      (url) => {
        urls.push(url);
        const body = url.includes("/depth")
          ? { data: { bids: [{ price: "50754", total_base: "60000000000" }], asks: [] } }
          : {
              data: {
                symbol: "XAUTUSDC",
                pricePrecision: "100",
                sizePrecision: "1000000",
                takerFeePps: 7000,
                tickSize: "1",
                minQuoteNotionalX18: "10000000000000000000",
              },
            };
        return Promise.resolve(new Response(JSON.stringify(body)));
      },
      "https://gateway.test/api",
    );
    expect(await client.depth("MONUSDC", 5)).toEqual({
      bids: [{ price: 50_754n, size: 60_000_000_000n }],
      asks: [],
    });
    expect(await client.market("0x0B4dD2A7b09d5c5401149fFe51301Cc589017343")).toEqual({
      symbol: "XAUTUSDC",
      pricePrecision: 100n,
      sizePrecision: 1_000_000n,
      takerFeeBps: 7,
      tickSize: 1n,
      minQuoteNotional: 10_000_000n,
    });
    expect(urls[0]).toBe("https://gateway.test/api/depth?symbol=MONUSDC&levels=5&state=finalized");
  });
});
