import { pyth } from "@yotrade/core/addresses";

/** A fresh price every second is as live as a fill needs, and it caps upstream calls at one per second. */
const LATEST_CACHE_MS = 1_000;
const TIMEOUT_MS = 8_000;
const MAX_ENTRIES = 256;
const FEEDS: ReadonlySet<string> = new Set(Object.values(pyth.feeds).map((id) => id.toLowerCase()));

export class PythProxyError extends Error {
  override readonly name = "PythProxyError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface PythProxyDeps {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

/**
 * Hermes behind our key. Browsers cannot hold the key, and a hundred traders must not become a hundred
 * upstream calls: identical requests share one response for a second, and one call while it is in flight.
 * Only the price-update endpoints and our own markets are reachable, so the key cannot be used as an open relay.
 * ponytail: cache is per instance. Fine for one server; a shared cache if there are many.
 */
export function createPythProxy(deps: PythProxyDeps) {
  const request = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const cache = new Map<string, { body: string; expires: number }>();
  const inFlight = new Map<string, Promise<string>>();

  async function load(path: string, ids: readonly string[]): Promise<string> {
    const query = ids.map((id) => `ids[]=${id}`).join("&");
    const response = await request(`${deps.baseUrl}${path}?${query}&encoding=hex&parsed=true`, {
      headers: { authorization: `Bearer ${deps.apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      // Upstream text can name the plan or the key's grants: report the status only.
      throw new PythProxyError(
        response.status === 404 ? 404 : 502,
        `Hermes answered ${response.status}`,
      );
    }
    return response.text();
  }

  return {
    /**
     * Only "latest": that is all a browser needs. Past prices settle tournaments on the server, which calls
     * Hermes directly, and every distinct timestamp here would be one more upstream call on our key.
     */
    async get(when: string, rawIds: readonly string[]): Promise<string> {
      if (when !== "latest") {
        throw new PythProxyError(400, "Expected `latest`");
      }
      const ids = [...new Set(rawIds.map((id) => id.toLowerCase()))].sort();
      if (ids.length === 0 || ids.some((id) => !FEEDS.has(id))) {
        throw new PythProxyError(400, "Unknown price feed");
      }
      const key = `${when}|${ids.join(",")}`;
      const hit = cache.get(key);
      if (hit && hit.expires > now()) {
        return hit.body;
      }
      const running = inFlight.get(key);
      if (running) {
        return await running;
      }
      const pending = load(`/v2/updates/price/${when}`, ids)
        .then((body) => {
          if (cache.size >= MAX_ENTRIES) {
            cache.clear();
          }
          cache.set(key, {
            body,
            expires: now() + LATEST_CACHE_MS,
          });
          return body;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
      return await pending;
    },
  };
}

export type PythProxy = ReturnType<typeof createPythProxy>;
