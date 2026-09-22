import { yotrade } from "@yotrade/core/addresses";
import { definePlugin } from "@yotrade/core/plugin";
import {
  type Account,
  type Address,
  type Chain,
  erc20Abi,
  type Hash,
  type Hex,
  numberToHex,
  type Transport,
  type WalletClient,
} from "viem";
import { sign } from "viem/accounts";

import { tournamentManagerAbi as abi } from "./generated/abi.ts";
import { type Phase, phaseAt, type Status, toStatus } from "./phase.ts";

export type Wallet = WalletClient<Transport, Chain, Account>;

export interface TournamentConfig {
  readonly prizeToken: Address;
  readonly capitalToken: Address;
  /** Admin-approved venue adapter, for example `yotrade.kuruVenueAdapter`. */
  readonly venue: Address;
  readonly prizePool: bigint;
  readonly startingCapital: bigint;
  readonly startTime: bigint;
  readonly endTime: bigint;
  readonly maxParticipants: number;
  readonly allowlistRoot: Hex;
  /** Share of the pool per rank in basis points, best first. Must sum to 10,000. */
  readonly prizeSplitBps: readonly number[];
  readonly metadataURI: string;
}

export interface Tournament {
  readonly id: bigint;
  readonly config: TournamentConfig;
  readonly organizer: Address;
  readonly status: Status;
  readonly phase: Phase;
  readonly participantCount: number;
  readonly claimableAt: bigint;
  readonly unpaid: bigint;
  readonly winners: readonly Address[];
}

export interface TournamentOptions {
  /** Defaults to the Monad testnet deployment. */
  readonly address?: Address;
  /** Test seam for the clock, in seconds. */
  readonly now?: () => bigint;
}

const NO_PROOF: readonly Hex[] = [];

export function tournament(options: TournamentOptions = {}) {
  return definePlugin("tournament", ({ publicClient }) => {
    const address = options.address ?? yotrade.tournamentManager;
    const now = options.now ?? (() => BigInt(Math.floor(Date.now() / 1000)));
    const contract = { address, abi } as const;

    /** Monad rejects a transaction sent right after another one, so every write waits for its receipt. */
    async function confirm(pending: Promise<Hash>): Promise<Hash> {
      const hash = await pending;
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error(`Transaction ${hash} reverted`);
      }
      return hash;
    }

    async function get(id: bigint): Promise<Tournament> {
      const [config, state, winners] = await Promise.all([
        publicClient.readContract({ ...contract, functionName: "getConfig", args: [id] }),
        publicClient.readContract({ ...contract, functionName: "getState", args: [id] }),
        publicClient.readContract({ ...contract, functionName: "getWinners", args: [id] }),
      ]);
      const [organizer, rawStatus, participantCount, claimableAt, unpaid] = state;
      const status = toStatus(rawStatus);

      return {
        id,
        config,
        organizer,
        status,
        phase: phaseAt(
          { status, startTime: config.startTime, endTime: config.endTime, claimableAt },
          now(),
        ),
        participantCount,
        claimableAt,
        unpaid,
        winners,
      };
    }

    return {
      address,

      count(): Promise<bigint> {
        return publicClient.readContract({ ...contract, functionName: "tournamentCount" });
      },

      get,

      /** The most recent tournaments, newest first. */
      async latest(limit = 10): Promise<Tournament[]> {
        const count = await publicClient.readContract({
          ...contract,
          functionName: "tournamentCount",
        });
        const ids: bigint[] = [];
        for (let id = count; id > 0n && ids.length < limit; id -= 1n) {
          ids.push(id);
        }
        return Promise.all(ids.map(get));
      },

      /** A participant's trading account and the capital recorded when they joined, or `null`. */
      async entry(id: bigint, participant: Address) {
        const [tradingAccount, capitalAtJoin] = await Promise.all([
          publicClient.readContract({
            ...contract,
            functionName: "tradingAccountOf",
            args: [id, participant],
          }),
          publicClient.readContract({
            ...contract,
            functionName: "capitalAtJoin",
            args: [id, participant],
          }),
        ]);
        return BigInt(tradingAccount) === 0n ? null : { tradingAccount, capitalAtJoin };
      },

      async prize(id: bigint, account: Address) {
        const [amount, claimed] = await publicClient.readContract({
          ...contract,
          functionName: "prizeOf",
          args: [id, account],
        });
        return { amount, claimed };
      },

      /** Escrows the prize pool, approving the token first when the allowance is short. */
      async create(wallet: Wallet, config: TournamentConfig): Promise<Hash> {
        if (config.prizePool > 0n) {
          const allowance = await publicClient.readContract({
            address: config.prizeToken,
            abi: erc20Abi,
            functionName: "allowance",
            args: [wallet.account.address, address],
          });
          if (allowance < config.prizePool) {
            await confirm(
              wallet.writeContract({
                address: config.prizeToken,
                abi: erc20Abi,
                functionName: "approve",
                args: [address, config.prizePool],
              }),
            );
          }
        }
        return confirm(
          wallet.writeContract({ ...contract, functionName: "createTournament", args: [config] }),
        );
      },

      join(wallet: Wallet, id: bigint, tradingAccount: Address, proof: readonly Hex[] = NO_PROOF) {
        return confirm(
          wallet.writeContract({
            ...contract,
            functionName: "join",
            args: [id, tradingAccount, proof],
          }),
        );
      },

      /** Sets or rotates the invite signer. Zero opens entry again. Organizer only. */
      setInvite: (wallet: Wallet, id: bigint, signer: Address) =>
        confirm(
          wallet.writeContract({ ...contract, functionName: "setInvite", args: [id, signer] }),
        ),

      setMetadata: (wallet: Wallet, id: bigint, metadataURI: string) =>
        confirm(
          wallet.writeContract({
            ...contract,
            functionName: "setMetadata",
            args: [id, metadataURI],
          }),
        ),

      inviteSignerOf: (id: bigint) =>
        publicClient.readContract({ ...contract, functionName: "inviteSignerOf", args: [id] }),

      /**
       * The invite proof for `participant`: the code's signature over the contract's digest, as the three
       * words `join` reads from the end of its proof argument.
       */
      async inviteProof(code: Hex, id: bigint, participant: Address): Promise<Hex[]> {
        const digest = await publicClient.readContract({
          ...contract,
          functionName: "inviteDigest",
          args: [id, participant],
        });
        // The digest already carries the EIP-191 prefix, so it is signed raw.
        const signature = await sign({ hash: digest, privateKey: code, to: "object" });
        const v = signature.v ?? BigInt((signature.yParity ?? 0) + 27);
        return [signature.r, signature.s, numberToHex(v, { size: 32 })];
      },

      postResults(wallet: Wallet, id: bigint, winners: readonly Address[]) {
        return confirm(
          wallet.writeContract({ ...contract, functionName: "postResults", args: [id, winners] }),
        );
      },

      voidResults: (wallet: Wallet, id: bigint) =>
        confirm(wallet.writeContract({ ...contract, functionName: "voidResults", args: [id] })),
      claim: (wallet: Wallet, id: bigint) =>
        confirm(wallet.writeContract({ ...contract, functionName: "claim", args: [id] })),
      cancel: (wallet: Wallet, id: bigint) =>
        confirm(wallet.writeContract({ ...contract, functionName: "cancel", args: [id] })),
      reclaim: (wallet: Wallet, id: bigint) =>
        confirm(wallet.writeContract({ ...contract, functionName: "reclaim", args: [id] })),
      sweep: (wallet: Wallet, id: bigint) =>
        confirm(wallet.writeContract({ ...contract, functionName: "sweep", args: [id] })),
    };
  });
}
