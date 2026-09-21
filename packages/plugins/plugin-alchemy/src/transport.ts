import { type HttpTransport, http } from "viem";

const NETWORKS = {
  10143: "monad-testnet",
  143: "monad-mainnet",
} as const;

export type AlchemyChainId = keyof typeof NETWORKS;

export function alchemyRpcUrl(apiKey: string, chainId: AlchemyChainId): string {
  if (apiKey.trim() === "") {
    throw new Error("Alchemy API key is empty");
  }
  return `https://${NETWORKS[chainId]}.g.alchemy.com/v2/${apiKey}`;
}

/** Drop-in viem transport, for example `createRuntime({ transport: alchemyTransport(key, 10143) })`. */
export function alchemyTransport(apiKey: string, chainId: AlchemyChainId): HttpTransport {
  return http(alchemyRpcUrl(apiKey, chainId), { batch: true });
}
