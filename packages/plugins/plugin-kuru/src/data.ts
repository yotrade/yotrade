import type { Address, Hash } from "viem";

export const KURU_TESTNET_DATA_URL = "https://api.testnet.kuru.io/api/v1";
export const KURU_TESTNET_GATEWAY_URL = "https://gateway.testnet.kuru.io/api";

export interface DataBalance {
  readonly token: Address;
  readonly total: bigint;
  readonly available: bigint;
  readonly reserved: bigint;
}

export interface DataTrade {
  readonly tradeId: string;
  readonly market: Address;
  readonly symbol: string;
  readonly isBuy: boolean;
  readonly isMaker: boolean;
  readonly price: bigint;
  readonly filledSize: bigint;
  /** Raw quote units scaled by 1e18, like the performance endpoint. */
  readonly realizedPnl: bigint;
  /** Fees paid on this fill, in raw USDC units (six decimals). */
  readonly feeUsdc: bigint;
  /** Inventory after the fill. Zero on the partial records the API emits for one order filling several levels. */
  readonly openSize: bigint;
  readonly openCost: bigint;
  readonly timestamp: number;
  readonly transactionHash: Hash;
}

interface RawBalance {
  tokenAddress: Address;
  total: string;
  available: string;
  reserved: string;
}

interface RawCandles {
  data: { t: number[]; o: string[]; h: string[]; l: string[]; c: string[]; v: string[] };
}

interface RawDepth {
  data: {
    bids: { price: string; total_base: string }[];
    asks: { price: string; total_base: string }[];
  };
}

interface RawTradesPage {
  data: {
    trades: {
      marketAddress: Address;
      blockTimestamp: number;
      pnl: { realizedPnl: string; openSize: string | null; openCost: string | null };
    }[];
    positions: { marketAddress: Address; openSize: string; openCost: string }[];
  };
  pagination?: { nextCursor: string | null };
}

interface RawTrade {
  tradeId: string;
  marketAddress: Address;
  symbol: string;
  isBuy: boolean;
  isMaker: boolean;
  price: string;
  filledSize: string;
  fees?: { makerFee?: string | null; takerFee?: string | null };
  pnl: { realizedPnl: string; openSize: string | null; openCost: string | null };
  blockTimestamp: number;
  transactionHash: Hash;
}

export const CANDLE_INTERVALS = ["1s", "1m", "5m", "1h", "6h", "1d"] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

export interface MarketInfo {
  /** Gateway symbol, for example `XAUTUSDC`. */
  readonly symbol: string;
  readonly pricePrecision: bigint;
  readonly sizePrecision: bigint;
  /** Taker fee in basis points, for display. The fee itself is already inside every quote. */
  readonly takerFeeBps: number;
  /** Prices must be a multiple of this, in price precision. */
  readonly tickSize: bigint;
  /** Smallest order the market accepts, in raw USDC. */
  readonly minQuoteNotional: bigint;
}

/** Prices in the market's price precision, volume in raw quote (USDC) units. Oldest first. */
export interface Candle {
  readonly time: number;
  readonly open: bigint;
  readonly high: bigint;
  readonly low: bigint;
  readonly close: bigint;
  readonly volumeUsdc: bigint;
}

/** Price in price precision, size in size precision. */
export interface DepthLevel {
  readonly price: bigint;
  readonly size: bigint;
}

export interface Depth {
  /** Best first: highest bid, lowest ask. */
  readonly bids: readonly DepthLevel[];
  readonly asks: readonly DepthLevel[];
}

export interface DataPosition {
  readonly market: Address;
  /** Base-token units still held. */
  readonly openSize: bigint;
  /** What that inventory cost, in raw quote (USDC) units. */
  readonly openCost: bigint;
}

export interface Performance {
  /** Realized PnL of fills inside the window, net of fees, in raw USDC units. */
  readonly realizedUsdc: bigint;
  readonly fills: number;
  /** Open inventory after the last fill in the window, or before it when there was none. */
  readonly positions: readonly DataPosition[];
  /** Open inventory when the window opened: what was bought before it and is still held. */
  readonly opening: readonly DataPosition[];
}

/** Kuru reports PnL in quote units scaled by 1e18; USDC has six decimals. */
const PNL_TO_USDC = 10n ** 12n;
const PAGE_SIZE = 500;
/** ponytail: 20 pages = 10,000 fills per trader per tournament. Raise it if a tournament ever gets there. */
const MAX_PAGES = 20;

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Folds fills, newest first as Kuru pages them, into realized PnL since `from`, the inventory after the newest
 * fill of each market, and the inventory held when `from` came. One order that walks several levels arrives as several records of which only one
 * carries the running inventory, so records without it are skipped.
 */
export function summarizeTrades(
  newestFirst: RawTradesPage["data"]["trades"],
  from: bigint,
): Performance {
  let realized = 0n;
  let fills = 0;
  const inventory = new Map<string, DataPosition>();
  const opening = new Map<string, DataPosition>();
  for (const trade of newestFirst) {
    const inside = BigInt(trade.blockTimestamp) >= from;
    if (inside) {
      realized += BigInt(trade.pnl.realizedPnl);
      fills += 1;
    }
    if (trade.pnl.openSize === null || trade.pnl.openCost === null) {
      continue;
    }
    const market = trade.marketAddress.toLowerCase();
    const position = {
      market: trade.marketAddress,
      openSize: BigInt(trade.pnl.openSize),
      openCost: BigInt(trade.pnl.openCost),
    };
    if (!inventory.has(market)) {
      inventory.set(market, position);
    }
    if (!(inside || opening.has(market))) {
      opening.set(market, position);
    }
  }
  return {
    realizedUsdc: realized / PNL_TO_USDC,
    fills,
    positions: [...inventory.values()],
    opening: [...opening.values()],
  };
}

/** Kuru's public Data Source API. Finalized data, no key required. */
export function createDataClient(
  baseUrl: string = KURU_TESTNET_DATA_URL,
  fetcher: Fetch = fetch,
  gatewayUrl: string = KURU_TESTNET_GATEWAY_URL,
) {
  async function get<T>(path: string, root: string = baseUrl): Promise<T> {
    const response = await fetcher(`${root}${path}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Kuru data API ${response.status} for ${path}`);
    }
    return (await response.json()) as T;
  }

  const client = {
    async balances(userId: bigint): Promise<DataBalance[]> {
      const body = await get<{ data: RawBalance[] }>(`/users/${userId}/balances`);
      return body.data.map((row) => ({
        token: row.tokenAddress,
        total: BigInt(row.total),
        available: BigInt(row.available),
        reserved: BigInt(row.reserved),
      }));
    },

    async market(address: Address): Promise<MarketInfo> {
      const body = await get<{
        data: {
          symbol: string;
          pricePrecision: string;
          sizePrecision: string;
          takerFeePps: number;
          tickSize: string;
          minQuoteNotionalX18: string;
        };
      }>(`/markets/${address.toLowerCase()}`);
      return {
        symbol: body.data.symbol,
        pricePrecision: BigInt(body.data.pricePrecision),
        sizePrecision: BigInt(body.data.sizePrecision),
        // Kuru's pps are parts per ten million: 7000 is 0.07 %, which is 7 bps.
        takerFeeBps: body.data.takerFeePps / 1_000,
        tickSize: BigInt(body.data.tickSize),
        minQuoteNotional: BigInt(body.data.minQuoteNotionalX18) / PNL_TO_USDC,
      };
    },

    /** Up to `countback` candles starting at `from` (Unix seconds). Empty intervals are simply absent. */
    async candles(
      address: Address,
      query: { interval: CandleInterval; from: number; countback?: number },
    ): Promise<Candle[]> {
      const params = new URLSearchParams({
        interval: query.interval,
        from: query.from.toString(),
        countback: (query.countback ?? 500).toString(),
      });
      const { data } = await get<RawCandles>(`/markets/${address.toLowerCase()}/candles?${params}`);
      return data.t.map((time, index) => ({
        time,
        open: BigInt(data.o[index] ?? 0),
        high: BigInt(data.h[index] ?? 0),
        low: BigInt(data.l[index] ?? 0),
        close: BigInt(data.c[index] ?? 0),
        volumeUsdc: BigInt(data.v[index] ?? 0) / PNL_TO_USDC,
      }));
    },

    /** Current book from the exchange gateway. `symbol` comes from `market()`. */
    async depth(symbol: string, levels = 20): Promise<Depth> {
      const params = new URLSearchParams({ symbol, levels: levels.toString(), state: "finalized" });
      const { data } = await get<RawDepth>(`/depth?${params}`, gatewayUrl);
      const level = (row: { price: string; total_base: string }): DepthLevel => ({
        price: BigInt(row.price),
        size: BigInt(row.total_base),
      });
      return { bids: data.bids.map(level), asks: data.asks.map(level) };
    },

    /**
     * Realized PnL of every fill between `from` and `to` (Unix seconds, inclusive) and the open positions.
     * Deposits and transfers are not fills, so they cannot move this number.
     */
    /**
     * Realized PnL and fills inside the window, and the open inventory as it stood at the window's end. Kuru's
     * own `positions` field is always the current one whatever the filters, so a sale after the end would erase
     * a loss: the inventory is rebuilt from the running `openSize`/`openCost` of the last fill at or before
     * `to`, reading every fill up to it.
     */
    async performance(userId: bigint, window: { from: bigint; to: bigint }): Promise<Performance> {
      const rows: RawTradesPage["data"]["trades"] = [];
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const query = new URLSearchParams({
          limit: PAGE_SIZE.toString(),
          from: "0",
          to: window.to.toString(),
          ...(cursor ? { cursor } : {}),
        });
        const body: RawTradesPage = await get(`/users/${userId}/trades?${query}`);
        rows.push(...body.data.trades);
        cursor = body.pagination?.nextCursor ?? null;
        if (!cursor) {
          break;
        }
      }
      return summarizeTrades(rows, window.from);
    },

    /**
     * The last traded price of a market at or before `time`, in price precision: the close of the newest
     * minute that ended by then. Null when it has not traded in the 30 days before. Candles are asked for from a
     * start, so hours find the last active one and minutes refine the hour `time` falls in.
     */
    async priceAt(address: Address, time: number): Promise<bigint | null> {
      const closedBy = (candles: Candle[], seconds: number) =>
        candles.filter((candle) => candle.time + seconds <= time).at(-1)?.close ?? null;
      const hour = Math.floor(time / 3_600) * 3_600;
      const [hours, minutes] = await Promise.all([
        client.candles(address, { interval: "1h", from: time - 30 * 86_400, countback: 1_000 }),
        client.candles(address, { interval: "1m", from: hour, countback: 60 }),
      ]);
      return closedBy(minutes, 60) ?? closedBy(hours, 3_600);
    },

    /** What the account holds on every market it has traded, and what that inventory cost. */
    async positions(userId: bigint): Promise<DataPosition[]> {
      const body: RawTradesPage = await get(`/users/${userId}/trades?limit=1`);
      return body.data.positions.map((row) => ({
        market: row.marketAddress,
        openSize: BigInt(row.openSize),
        openCost: BigInt(row.openCost),
      }));
    },

    /** Most recent fills first. */
    async trades(userId: bigint, limit = 100): Promise<DataTrade[]> {
      const body = await get<{ data: { trades: RawTrade[] } }>(
        `/users/${userId}/trades?limit=${limit}`,
      );
      return body.data.trades.map((row) => ({
        tradeId: row.tradeId,
        market: row.marketAddress,
        symbol: row.symbol,
        isBuy: row.isBuy,
        isMaker: row.isMaker,
        price: BigInt(row.price),
        filledSize: BigInt(row.filledSize),
        realizedPnl: BigInt(row.pnl.realizedPnl),
        feeUsdc: (BigInt(row.fees?.takerFee ?? 0) + BigInt(row.fees?.makerFee ?? 0)) / PNL_TO_USDC,
        openSize: BigInt(row.pnl.openSize ?? 0),
        openCost: BigInt(row.pnl.openCost ?? 0),
        timestamp: row.blockTimestamp,
        transactionHash: row.transactionHash,
      }));
    },
  };
  return client;
}

export type DataClient = ReturnType<typeof createDataClient>;
