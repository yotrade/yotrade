import type { Address, Hash } from "viem";

export const KURU_TESTNET_DATA_URL = "https://api.testnet.kuru.io/api/v1";

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
  readonly realizedPnl: bigint;
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

interface RawTradesPage {
  data: {
    trades: { pnl: { realizedPnl: string } }[];
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
  pnl: { realizedPnl: string; openSize: string; openCost: string };
  blockTimestamp: number;
  transactionHash: Hash;
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
  readonly positions: readonly DataPosition[];
}

/** Kuru reports PnL in quote units scaled by 1e18; USDC has six decimals. */
const PNL_TO_USDC = 10n ** 12n;
const PAGE_SIZE = 500;
/** ponytail: 20 pages = 10,000 fills per trader per tournament. Raise it if a tournament ever gets there. */
const MAX_PAGES = 20;

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Kuru's public Data Source API. Finalized data, no key required. */
export function createDataClient(baseUrl: string = KURU_TESTNET_DATA_URL, fetcher: Fetch = fetch) {
  async function get<T>(path: string): Promise<T> {
    const response = await fetcher(`${baseUrl}${path}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Kuru data API ${response.status} for ${path}`);
    }
    return (await response.json()) as T;
  }

  return {
    async balances(userId: bigint): Promise<DataBalance[]> {
      const body = await get<{ data: RawBalance[] }>(`/users/${userId}/balances`);
      return body.data.map((row) => ({
        token: row.tokenAddress,
        total: BigInt(row.total),
        available: BigInt(row.available),
        reserved: BigInt(row.reserved),
      }));
    },

    /**
     * Realized PnL of every fill between `from` and `to` (Unix seconds, inclusive) and the open positions.
     * Deposits and transfers are not fills, so they cannot move this number.
     */
    async performance(userId: bigint, window: { from: bigint; to: bigint }): Promise<Performance> {
      let realized = 0n;
      let fills = 0;
      let positions: DataPosition[] = [];
      let cursor: string | null = null;

      for (let page = 0; page < MAX_PAGES; page++) {
        const query = new URLSearchParams({
          limit: PAGE_SIZE.toString(),
          from: window.from.toString(),
          to: window.to.toString(),
          ...(cursor ? { cursor } : {}),
        });
        const body: RawTradesPage = await get(`/users/${userId}/trades?${query}`);
        for (const trade of body.data.trades) {
          realized += BigInt(trade.pnl.realizedPnl);
        }
        fills += body.data.trades.length;
        positions = body.data.positions.map((row) => ({
          market: row.marketAddress,
          openSize: BigInt(row.openSize),
          openCost: BigInt(row.openCost),
        }));
        cursor = body.pagination?.nextCursor ?? null;
        if (!cursor) {
          break;
        }
      }
      return { realizedUsdc: realized / PNL_TO_USDC, fills, positions };
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
        openSize: BigInt(row.pnl.openSize),
        openCost: BigInt(row.pnl.openCost),
        timestamp: row.blockTimestamp,
        transactionHash: row.transactionHash,
      }));
    },
  };
}

export type DataClient = ReturnType<typeof createDataClient>;
