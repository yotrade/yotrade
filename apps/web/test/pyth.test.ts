import { describe, expect, test } from "bun:test";

import { pyth } from "@yotrade/core/addresses";

import { createPythProxy, PythProxyError } from "@/server/pyth.ts";

const BTC = pyth.feeds["BTC/USD"];
const ETH = pyth.feeds["ETH/USD"];

function upstream(status = 200) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetcher = ((url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    return Promise.resolve(new Response(`{"n":${calls.length}}`, { status }));
  }) as typeof fetch;
  return { calls, fetcher };
}

describe("pyth proxy", () => {
  test("forwards with the key and shares one response per second", async () => {
    const { calls, fetcher } = upstream();
    let clock = 1_000;
    const proxy = createPythProxy({
      baseUrl: "https://h",
      apiKey: "secret",
      fetch: fetcher,
      now: () => clock,
    });

    const [a, b] = await Promise.all([
      proxy.get("latest", [BTC, ETH]),
      proxy.get("latest", [ETH, BTC]),
    ]);
    expect(a).toBe(b);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.auth).toBe("Bearer secret");
    expect(calls[0]?.url).toStartWith("https://h/v2/updates/price/latest?ids[]=");

    clock += 999;
    await proxy.get("latest", [BTC, ETH]);
    expect(calls).toHaveLength(1);
    clock += 2;
    await proxy.get("latest", [BTC, ETH]);
    expect(calls).toHaveLength(2);
  });

  test("is not an open relay: only our feeds, only the latest price", async () => {
    const { calls, fetcher } = upstream();
    const proxy = createPythProxy({ baseUrl: "https://h", apiKey: "k", fetch: fetcher });
    const other = `0x${"ab".repeat(32)}`;
    for (const attempt of [
      proxy.get("latest", [other]),
      proxy.get("latest", []),
      proxy.get("../../v2/price_feeds", [BTC]),
      proxy.get("123", [BTC]),
      // Past prices settle tournaments server-side; through here each timestamp would cost an upstream call.
      proxy.get("1790026681", [BTC]),
    ]) {
      await expect(attempt).rejects.toBeInstanceOf(PythProxyError);
    }
    expect(calls).toHaveLength(0);
  });

  test("an upstream failure is reported by status only and not cached", async () => {
    const failing = upstream(403);
    const proxy = createPythProxy({ baseUrl: "https://h", apiKey: "k", fetch: failing.fetcher });
    await expect(proxy.get("latest", [BTC])).rejects.toThrow("Hermes answered 403");
    await expect(proxy.get("latest", [BTC])).rejects.toBeInstanceOf(PythProxyError);
    expect(failing.calls).toHaveLength(2);
  });
});
