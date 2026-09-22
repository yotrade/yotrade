import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { definePlugin } from "@yotrade/core/plugin";
import {
  type Account,
  type Address,
  bytesToHex,
  type Chain,
  createWalletClient,
  custom,
  type Hex,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { deriveKey, deriveSecp256k1Key, PRF_SALT } from "./derive.ts";
import { createVault, type Vault } from "./vault.ts";

export interface PrfResult {
  readonly credentialId: string;
  readonly prfOutput: Uint8Array;
}

/** Where the 32 bytes of entropy come from. Replaced in tests; WebAuthn in production. */
export interface PrfSource {
  register(user: { name: string; displayName: string }): Promise<PrfResult>;
  signIn(): Promise<PrfResult>;
}

/**
 * Where a signed-in identity may be kept between page loads. Whatever is stored can rebuild every key, so it
 * belongs in storage that dies with the tab, never on disk. Without a store every load asks for the passkey.
 */
export interface SessionStore {
  load(): PrfResult | null;
  save(result: PrfResult): void;
  clear(): void;
}

export interface MeraOptions {
  /** Relying party: the host the passkey is scoped to, and the name the authenticator shows. */
  readonly rp: { readonly id: string; readonly name: string };
  readonly source?: PrfSource;
  readonly session?: SessionStore;
}

export type MeraWallet = WalletClient<Transport, Chain, Account>;

/** A secp256k1 key used as a shared secret: the private part goes in a link, the address goes onchain. */
export interface InviteKey {
  readonly privateKey: Hex;
  readonly address: Address;
}

export interface Identity {
  readonly credentialId: string;
  /** The participant's main account. Signs without prompting for the lifetime of the identity. */
  readonly wallet: MeraWallet;
  /** Isolated trading account for one tournament. The same id always yields the same account. */
  tournamentWallet(tournamentId: bigint): MeraWallet;
  /** Encrypts private data for untrusted storage. Only this passkey can open it again. */
  vault(): Promise<Vault>;
  /**
   * The invite code of a tournament this passkey hosts: a capability key, not an account. Deterministic, so
   * the host can share or rotate it from any device without storing anything. Rotating means a new epoch.
   */
  inviteKey(tournamentId: bigint, epoch: number): InviteKey;
  /** Ends every signing session and wipes the entropy. The identity is unusable afterwards. */
  end(): void;
}

function webAuthnSource(rp: MeraOptions["rp"]): PrfSource {
  return {
    register: (user) => createPasskeyWithPrfOutput({ rp, user, prfSalt: PRF_SALT }),
    signIn: () => getPasskeyPrfOutput({ rpId: rp.id, prfSalt: PRF_SALT }),
  };
}

export function mera(options: MeraOptions) {
  return definePlugin("mera", ({ chain, publicClient }) => {
    const source = options.source ?? webAuthnSource(options.rp);

    function toIdentity({ credentialId, prfOutput }: PrfResult): Identity {
      // The store keeps its own copy: the one handed in is wiped below.
      options.session?.save({ credentialId, prfOutput: prfOutput.slice() });
      const entropy = prfOutput.slice();
      prfOutput.fill(0);
      const sessions: { end(): void }[] = [];
      let ended = false;

      const assertLive = () => {
        if (ended) {
          throw new Error("This identity has been ended; sign in again");
        }
      };

      const open = (privateKey: Uint8Array): MeraWallet => {
        const session = createSecp256k1SigningSession({ privateKey });
        privateKey.fill(0);
        sessions.push(session);
        // Reuses the runtime's transport, so reads and writes share one RPC configuration.
        return createWalletClient({
          account: toViemAccount(session),
          chain,
          transport: custom(publicClient),
        });
      };

      const tournamentWallets = new Map<bigint, MeraWallet>();

      return {
        credentialId,
        wallet: open(deriveSecp256k1Key(entropy, { kind: "account" })),

        tournamentWallet(tournamentId) {
          assertLive();
          const existing = tournamentWallets.get(tournamentId);
          if (existing) {
            return existing;
          }
          const wallet = open(
            deriveSecp256k1Key(entropy, { kind: "tournament", chainId: chain.id, tournamentId }),
          );
          tournamentWallets.set(tournamentId, wallet);
          return wallet;
        },

        vault() {
          assertLive();
          return createVault(deriveKey(entropy, { kind: "vault" }));
        },

        inviteKey(tournamentId, epoch) {
          assertLive();
          const privateKey = bytesToHex(
            deriveSecp256k1Key(entropy, { kind: "invite", chainId: chain.id, tournamentId, epoch }),
          );
          return { privateKey, address: privateKeyToAccount(privateKey).address };
        },

        end() {
          ended = true;
          for (const session of sessions) {
            session.end();
          }
          entropy.fill(0);
          tournamentWallets.clear();
        },
      };
    }

    return {
      /** Creates a new passkey. One user-verification prompt on authenticators that evaluate PRF at creation. */
      async register(user: { name: string; displayName: string }): Promise<Identity> {
        return toIdentity(await source.register(user));
      },

      /** Signs in with a discoverable passkey. */
      async signIn(): Promise<Identity> {
        return toIdentity(await source.signIn());
      },

      /** The identity kept by the session store, without a prompt. Null when there is none. */
      resume(): Identity | null {
        const kept = options.session?.load();
        return kept ? toIdentity(kept) : null;
      },

      /** Drops what the session store keeps. Call it on sign-out. */
      forget(): void {
        options.session?.clear();
      },
    };
  });
}
