import type { Hex } from "viem";

import { toWad } from "./math.ts";

export interface HermesPrice {
  /** USD 1e18. */
  readonly price: bigint;
  readonly publishTime: number;
}

export interface HermesUpdate {
  /** What the contract takes as `priceUpdate`. */
  readonly updates: readonly Hex[];
  readonly prices: Readonly<Record<Hex, HermesPrice>>;
}

export interface HermesOptions {
  /**
   * Where Hermes answers. Hermes needs an API key since the Pyth Core upgrade of 2026-08-26, so browsers
   * point this at a same-origin proxy and only servers pass the real endpoint with `headers`.
   */
  readonly baseUrl: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly fetch?: typeof fetch;
}

interface RawResponse {
  readonly binary: { readonly data: readonly string[] };
  readonly parsed: readonly {
    readonly id: string;
    readonly price: {
      readonly price: string;
      readonly expo: number;
      readonly publish_time: number;
    };
  }[];
}

export function hermes(options: HermesOptions) {
  const request = options.fetch ?? fetch;

  async function get(path: string, ids: readonly Hex[]): Promise<HermesUpdate> {
    const query = ids.map((id) => `ids[]=${id}`).join("&");
    const response = await request(`${options.baseUrl}${path}?${query}&encoding=hex&parsed=true`, {
      headers: options.headers ?? {},
    });
    if (!response.ok) {
      throw new Error(`Hermes answered ${response.status}`);
    }
    const raw = (await response.json()) as RawResponse;
    const prices: Record<Hex, HermesPrice> = {};
    for (const feed of raw.parsed) {
      prices[`0x${feed.id.replace(/^0x/, "")}`] = {
        price: toWad(BigInt(feed.price.price), feed.price.expo),
        publishTime: feed.price.publish_time,
      };
    }
    const missing = ids.filter((id) => !(id.toLowerCase() in prices));
    if (missing.length > 0) {
      throw new Error(`Hermes returned no price for ${missing.join(", ")}`);
    }
    return { updates: raw.binary.data.map((blob): Hex => `0x${blob.replace(/^0x/, "")}`), prices };
  }

  return {
    /** The newest update for every id, in one signed blob. */
    latest: (ids: readonly Hex[]) => get("/v2/updates/price/latest", ids),
    /** The first update at or after `publishTime`: what `settle` accepts for a tournament's end. */
    at: (ids: readonly Hex[], publishTime: bigint) => get(`/v2/updates/price/${publishTime}`, ids),
  };
}

export type Hermes = ReturnType<typeof hermes>;
