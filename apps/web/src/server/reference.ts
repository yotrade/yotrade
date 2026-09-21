import type { Bar, RangeName } from "@/lib/chart.ts";
import type { MarketSlug } from "@/lib/markets.ts";

/**
 * Global reference prices from free public market data. Kuru's testnet books set the price you trade at;
 * these series show what the asset does in the real world, and are always labelled as a reference.
 */
const SOURCES = {
  cbbtc: { venue: "binance", symbol: "BTCUSDT", label: "Binance · BTC/USDT" },
  // Binance lists PAX Gold, not Tether Gold. Both track an ounce of gold.
  xaut0: { venue: "binance", symbol: "PAXGUSDT", label: "Binance · PAXG/USDT (gold)" },
  mon: { venue: "gate", symbol: "MON_USDT", label: "Gate · MON/USDT" },
} as const satisfies Record<
  MarketSlug,
  { venue: "binance" | "gate"; symbol: string; label: string }
>;

/** Candle size and count per range, chosen to land near 100 to 170 points. */
const PLAN: Record<RangeName, { binance: string; gate: string; limit: number; seconds: number }> = {
  "1H": { binance: "1m", gate: "1m", limit: 60, seconds: 3_600 },
  "24H": { binance: "15m", gate: "15m", limit: 96, seconds: 86_400 },
  "1W": { binance: "1h", gate: "1h", limit: 168, seconds: 604_800 },
  "1M": { binance: "4h", gate: "4h", limit: 180, seconds: 2_592_000 },
  All: { binance: "1d", gate: "1d", limit: 365, seconds: 31_536_000 },
};

const CACHE_MS = 30_000;
const TIMEOUT_MS = 8_000;

export interface Reference {
  readonly label: string;
  readonly from: number;
  readonly to: number;
  readonly bars: Bar[];
}

const finite = (bar: Bar) => Object.values(bar).every((value) => Number.isFinite(value));

/** Binance kline rows: [openTime ms, open, high, low, close, base volume, closeTime, quote volume, ...]. */
export function parseBinance(rows: unknown): Bar[] {
  if (!Array.isArray(rows)) {
    throw new Error("Unexpected Binance response");
  }
  return rows
    .map((row: unknown[]) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[7]),
    }))
    .filter(finite);
}

/** Gate candlestick rows: [time s, quote volume, close, high, low, open, base volume, closed]. */
export function parseGate(rows: unknown): Bar[] {
  if (!Array.isArray(rows)) {
    throw new Error("Unexpected Gate response");
  }
  return rows
    .map((row: unknown[]) => ({
      time: Number(row[0]),
      open: Number(row[5]),
      high: Number(row[3]),
      low: Number(row[4]),
      close: Number(row[2]),
      volume: Number(row[1]),
    }))
    .filter(finite);
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Upstream load does not grow with visitors: the route's CDN headers absorb most requests, this cache absorbs the
 * rest per instance, and concurrent misses share one request. Worst case is two calls a minute per series.
 */
export function createReference(fetcher: Fetch = fetch, now: () => number = Date.now) {
  const cache = new Map<string, { at: number; value: Reference }>();
  // Concurrent visitors asking for the same series share one upstream request.
  const inFlight = new Map<string, Promise<Reference>>();

  async function load(market: MarketSlug, range: RangeName): Promise<Reference> {
    const source = SOURCES[market];
    const plan = PLAN[range];
    const url =
      source.venue === "binance"
        ? `https://data-api.binance.vision/api/v3/klines?symbol=${source.symbol}&interval=${plan.binance}&limit=${plan.limit}`
        : `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${source.symbol}&interval=${plan.gate}&limit=${plan.limit}`;
    const response = await fetcher(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`${source.venue} answered ${response.status}`);
    }
    const body: unknown = await response.json();
    const bars = source.venue === "binance" ? parseBinance(body) : parseGate(body);
    const to = Math.floor(now() / 1000);
    return { label: source.label, from: to - plan.seconds, to, bars };
  }

  return function reference(market: MarketSlug, range: RangeName): Promise<Reference> {
    const key = `${market}:${range}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) {
      return Promise.resolve(hit.value);
    }
    const running = inFlight.get(key);
    if (running) {
      return running;
    }
    const next = load(market, range)
      .then((value) => {
        cache.set(key, { at: now(), value });
        return value;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, next);
    return next;
  };
}
