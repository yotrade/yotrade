import { describe, expect, test } from "bun:test";

import { hermes } from "../src/hermes.ts";

const BTC = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const body = {
  binary: { encoding: "hex", data: ["504e4155"] },
  parsed: [
    {
      id: BTC.slice(2),
      price: { price: "8123122227516", conf: "1", expo: -8, publish_time: 1_789_964_747 },
    },
  ],
};

function fake(status: number, json: unknown) {
  const calls: { url: string; headers: unknown }[] = [];
  const fetcher = ((url: string, init?: RequestInit) => {
    calls.push({ url, headers: init?.headers });
    return Promise.resolve(new Response(JSON.stringify(json), { status }));
  }) as typeof fetch;
  return { calls, fetcher };
}

describe("hermes client", () => {
  test("asks for every id and returns prefixed blobs and 1e18 prices", async () => {
    const { calls, fetcher } = fake(200, body);
    const client = hermes({
      baseUrl: "/api/pyth",
      headers: { authorization: "Bearer k" },
      fetch: fetcher,
    });
    const update = await client.latest([BTC]);

    expect(calls[0]?.url).toBe(
      `/api/pyth/v2/updates/price/latest?ids[]=${BTC}&encoding=hex&parsed=true`,
    );
    expect(calls[0]?.headers).toEqual({ authorization: "Bearer k" });
    expect(update.updates).toEqual(["0x504e4155"]);
    expect(update.prices[BTC]?.price).toBe(81_231_222_275_160_000_000_000n);
    expect(update.prices[BTC]?.publishTime).toBe(1_789_964_747);
  });

  test("settlement asks for the update at the end time", async () => {
    const { calls, fetcher } = fake(200, body);
    await hermes({ baseUrl: "https://h", fetch: fetcher }).at([BTC], 1_789_000_000n);
    expect(calls[0]?.url).toStartWith("https://h/v2/updates/price/1789000000?");
  });

  test("fails loudly on an error status or a missing feed", async () => {
    await expect(
      hermes({ baseUrl: "", fetch: fake(401, {}).fetcher }).latest([BTC]),
    ).rejects.toThrow("401");
    const other = `0x${"ab".repeat(32)}` as const;
    await expect(
      hermes({ baseUrl: "", fetch: fake(200, body).fetcher }).latest([BTC, other]),
    ).rejects.toThrow("no price");
  });
});
