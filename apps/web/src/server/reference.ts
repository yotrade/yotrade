import { type Bar, MAX_CANDLES, type RangeName } from "@/lib/chart.ts";
import type { MarketSlug } from "@/lib/markets.ts";
import type { PerpsSlug } from "@/lib/perps-markets.ts";

/**
 * Global reference prices from free public market data. Kuru's testnet books set the price you trade at;
 * these series show what the asset does in the real world, and are always labelled as a reference.
 */
export type ReferenceSlug = MarketSlug | PerpsSlug;

const SOURCES = {
  cbbtc: { venue: "binance", symbol: "BTCUSDT", label: "Binance · BTC/USDT" },
  // Binance lists PAX Gold, not Tether Gold. Both track an ounce of gold.
  xaut0: { venue: "binance", symbol: "PAXGUSDT", label: "Binance · PAXG/USDT (gold)" },
  mon: { venue: "gate", symbol: "MON_USDT", label: "Gate · MON/USDT" },
  // Futures fill at Pyth prices, which track these markets within a few basis points.
  btc: { venue: "binance", symbol: "BTCUSDT", label: "Binance · BTC/USDT" },
  eth: { venue: "binance", symbol: "ETHUSDT", label: "Binance · ETH/USDT" },
  sol: { venue: "binance", symbol: "SOLUSDT", label: "Binance · SOL/USDT" },
} as const satisfies Record<
  ReferenceSlug,
  { venue: "binance" | "gate"; symbol: string; label: string }
>;

/** Interval per venue and the length of one candle there. Gate's shortest candle is ten seconds. */
const PLAN: Record<RangeName, { binance: [string, number]; gate: [string, number] }> = {
  "1s": { binance: ["1s", 1], gate: ["10s", 10] },
  "1m": { binance: ["1m", 60], gate: ["1m", 60] },
  "5m": { binance: ["5m", 300], gate: ["5m", 300] },
  "15m": { binance: ["15m", 900], gate: ["15m", 900] },
  "1h": { binance: ["1h", 3_600], gate: ["1h", 3_600] },
  "4h": { binance: ["4h", 14_400], gate: ["4h", 14_400] },
  "1D": { binance: ["1d", 86_400], gate: ["1d", 86_400] },
};

const CACHE_MS = 30_000;
/** One-second and one-minute candles go stale faster than the rest. */
const FAST_CACHE_MS = 3_000;
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

  async function load(market: ReferenceSlug, range: RangeName): Promise<Reference> {
    const source = SOURCES[market];
    const [interval, seconds] = PLAN[range][source.venue];
    const url =
      source.venue === "binance"
        ? `https://data-api.binance.vision/api/v3/klines?symbol=${source.symbol}&interval=${interval}&limit=${MAX_CANDLES}`
        : `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${source.symbol}&interval=${interval}&limit=${MAX_CANDLES}`;
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
    return { label: source.label, from: to - seconds * MAX_CANDLES, to, bars };
  }

  return function reference(market: ReferenceSlug, range: RangeName): Promise<Reference> {
    const key = `${market}:${range}`;
    const hit = cache.get(key);
    const ttl = range === "1s" || range === "1m" ? FAST_CACHE_MS : CACHE_MS;
    if (hit && now() - hit.at < ttl) {
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
