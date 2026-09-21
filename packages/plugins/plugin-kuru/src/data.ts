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
