import { definePlugin } from "@yotrade/core/plugin";
import { type Address, createPublicClient, type Hex, hexToBigInt, type Transport } from "viem";

import { type AlchemyChainId, alchemyTransport } from "./transport.ts";

export interface AlchemyOptions {
  readonly apiKey: string;
  /** Test seam: replaces the HTTP transport. */
  readonly transport?: Transport;
}

export interface TokenBalance {
  readonly token: Address;
  readonly balance: bigint;
}

interface TokenBalancesResponse {
  readonly tokenBalances: readonly { contractAddress: Address; tokenBalance: Hex | null }[];
}

/** Alchemy's enhanced APIs on top of the chain the runtime is configured for. */
export function alchemy(options: AlchemyOptions) {
  return definePlugin("alchemy", ({ chain }) => {
    const client = createPublicClient({
      chain,
      transport: options.transport ?? alchemyTransport(options.apiKey, chain.id as AlchemyChainId),
    });

    return {
      /** Non-zero ERC-20 balances of `owner`, optionally limited to `tokens`. */
      async getTokenBalances(owner: Address, tokens?: readonly Address[]): Promise<TokenBalance[]> {
        const response = (await client.request({
          // biome-ignore lint/suspicious/noExplicitAny: Alchemy-specific method outside viem's RPC schema
          method: "alchemy_getTokenBalances" as any,
          params: [owner, tokens ?? "erc20"] as never,
        })) as TokenBalancesResponse;

        return response.tokenBalances
          .map(({ contractAddress, tokenBalance }) => ({
            token: contractAddress,
            balance: tokenBalance ? hexToBigInt(tokenBalance) : 0n,
          }))
          .filter(({ balance }) => balance > 0n);
      },
    };
  });
}
