import { pyth, yotrade } from "@yotrade/core/addresses";
import { definePlugin } from "@yotrade/core/plugin";
import type { Account, Address, Chain, Hash, Hex, Transport, WalletClient } from "viem";

import { perpsEngineAbi as abi } from "./generated/abi.ts";
import type { Hermes } from "./hermes.ts";
import type { Position } from "./math.ts";

export type Wallet = WalletClient<Transport, Chain, Account>;

export interface OpenPosition extends Position {
  /** Pyth feed id. */
  readonly market: Hex;
}

export interface PerpsAccount {
  /** Cash, USD 1e18: the starting balance plus realized profit, minus fees. */
  readonly balance: bigint;
  readonly positions: readonly OpenPosition[];
}

export interface PerpsOptions {
  readonly hermes: Hermes;
  /** Defaults to the Monad testnet deployment. */
  readonly engine?: Address;
  readonly pyth?: Address;
}

const updateFeeAbi = [
  {
    type: "function",
    name: "getUpdateFee",
    stateMutability: "view",
    inputs: [{ name: "updateData", type: "bytes[]" }],
    outputs: [{ name: "feeAmount", type: "uint256" }],
  },
] as const;

export function perps(options: PerpsOptions) {
  return definePlugin("perps", ({ publicClient }) => {
    const contract = { address: options.engine ?? yotrade.perpsEngine, abi } as const;
    const oracle = { address: options.pyth ?? pyth.address, abi: updateFeeAbi } as const;

    /** Monad rejects a transaction sent right after another one, so every write waits for its receipt. */
    async function confirm(pending: Promise<Hash>): Promise<Hash> {
      const hash = await pending;
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error(`Transaction ${hash} reverted`);
      }
      return hash;
    }

    async function account(tournamentId: bigint, trader: Address): Promise<PerpsAccount> {
      const [balance, markets] = await publicClient.readContract({
        ...contract,
        functionName: "accountOf",
        args: [tournamentId, trader],
      });
      const positions = await Promise.all(
        markets.map(async (market) => ({
          market,
          ...(await publicClient.readContract({
            ...contract,
            functionName: "positionOf",
            args: [tournamentId, trader, market],
          })),
        })),
      );
      return { balance, positions };
    }

    /** The engine wants Pyth's exact fee, so it is read for the very update being sent. */
    const feeOf = (updates: readonly Hex[]) =>
      publicClient.readContract({ ...oracle, functionName: "getUpdateFee", args: [updates] });

    return {
      account,
      /** The tournament's leverage cap: 5, 20 or 100. */
      leverageCapOf: (tournamentId: bigint) =>
        publicClient.readContract({
          ...contract,
          functionName: "leverageCapOf",
          args: [tournamentId],
        }),
      /** Sets the cap. Only the organizer, only before the start, only 5, 20 or 100. */
      setLeverageCap: (wallet: Wallet, tournamentId: bigint, cap: bigint) =>
        confirm(
          wallet.writeContract({
            ...contract,
            functionName: "setLeverageCap",
            args: [tournamentId, cap],
          }),
        ),

      /** Newest prices (USD 1e18) and the signed update that proves them. */
      latest: options.hermes.latest,
      /** Prices at a past moment: the first update at or after `publishTime`. */
      at: options.hermes.at,

      /**
       * Fills `sizeDelta` at the newest Pyth price. The update covers every open market as well, because a
       * fill that adds risk values the whole account.
       */
      async trade(
        wallet: Wallet,
        order: { tournamentId: bigint; market: Hex; sizeDelta: bigint },
      ): Promise<Hash> {
        const open = await account(order.tournamentId, wallet.account.address);
        const ids = [...new Set([order.market, ...open.positions.map((p) => p.market)])];
        const { updates } = await options.hermes.latest(ids);
        return confirm(
          wallet.writeContract({
            ...contract,
            functionName: "trade",
            args: [order.tournamentId, order.market, order.sizeDelta, updates],
            value: await feeOf(updates),
          }),
        );
      },

      /** Closes every position of `trader` at the newest Pyth price when the account is under maintenance. */
      async liquidate(
        wallet: Wallet,
        target: { tournamentId: bigint; trader: Address },
      ): Promise<Hash> {
        const { positions } = await account(target.tournamentId, target.trader);
        const { updates } = await options.hermes.latest(positions.map((p) => p.market));
        return confirm(
          wallet.writeContract({
            ...contract,
            functionName: "liquidate",
            args: [target.tournamentId, target.trader, updates],
            value: await feeOf(updates),
          }),
        );
      },
      /** Closes every position of `trader` at the first Pyth price at or after `endTime`. Anyone may call. */
      async settle(
        wallet: Wallet,
        target: { tournamentId: bigint; trader: Address; endTime: bigint },
      ): Promise<Hash | null> {
        const { positions } = await account(target.tournamentId, target.trader);
        if (positions.length === 0) {
          return null;
        }
        const { updates } = await options.hermes.at(
          positions.map((p) => p.market),
          target.endTime,
        );
        return confirm(
          wallet.writeContract({
            ...contract,
            functionName: "settle",
            args: [target.tournamentId, target.trader, updates],
            value: await feeOf(updates),
          }),
        );
      },
    };
  });
}
