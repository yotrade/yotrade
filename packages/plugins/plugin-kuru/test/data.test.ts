import { describe, expect, test } from "bun:test";

import { createDataClient } from "../src/data.ts";
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
              pnl: { realizedPnl: "0", openSize: "97955", openCost: "99999951" },
              blockTimestamp: 1_789_983_348,
              transactionHash: "0xa723",
            },
          ],
        },
      }),
    );

    const [trade] = await client.trades(80n, 5);
    expect(trade).toMatchObject({
      price: 10_202_644n,
      openSize: 97_955n,
      openCost: 99_999_951n,
      isBuy: true,
    });
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
