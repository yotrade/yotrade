import type { Address } from "viem";

/** Monad testnet (chain 10143). Sources: Kuru Spot V2 testnet deployments, packages/contracts/deployments. */
export const MONAD_TESTNET_CHAIN_ID = 10_143;

export const yotrade = {
  tournamentManager: "0x5545a535D0782f8EdcE4Fb3373F65EcA10954F0D",
} as const satisfies Record<string, Address>;

export const kuru = {
  accountCore: "0x6384e9b2Bf3b65e1535403a0A543b5FDA905eE22",
  spotRouter: "0xba24a1042701f06e8F7edCF04389260D1Fa4c697",
  tradingWallet: "0xc7f2a9761276F7050D6561d2FDC51abC993F45E9",
  faucet: "0x25B1416FcD3400bE2D8F50bbe7Cf1101b8B891E9",
} as const satisfies Record<string, Address>;

export const tokens = {
  usdc: { address: "0xEe0722ead54f1B4fe97bE399Be43BC0226a6f97E", decimals: 6 },
  weth: { address: "0x8B6C5fafeF85B030bB1e71ae7ac085cC2380aAf8", decimals: 18 },
  cbBtc: { address: "0xef2a20a161ac9ed1117d721336226b6399F15b4D", decimals: 8 },
  xaut0: { address: "0xee1Dce135a9aB598bca8CF3a28bDEF6892100740", decimals: 6 },
} as const satisfies Record<string, { address: Address; decimals: number }>;

/** Spot markets, all quoted in USDC. Each one is its own OrderBook proxy. */
export const markets = {
  "cbBTC/USDC": "0x5BDEA6F9F9abA34F4EcB9B865646A792b835ef7f",
  "WETH/USDC": "0xa9C2936656a7D2143720BcD91Ba8506200B7CbE7",
  "MON/USDC": "0xfdbE356828c8f5A5d5ed4f69ddE0816f4058Ef61",
  "XAUt0/USDC": "0x0B4dD2A7b09d5c5401149fFe51301Cc589017343",
} as const satisfies Record<string, Address>;
