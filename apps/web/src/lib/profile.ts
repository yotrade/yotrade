import { yotrade } from "@yotrade/core/addresses";
import type { Account, Address, Chain, PublicClient, Transport, WalletClient } from "viem";

/** `ProfileRegistry` caps names at 32 bytes, not characters. */
export const MAX_NAME_BYTES = 32;

/** The Ghost kit's avatars: a gradient under a 3D shape in `public/avatars`. Zero means "none chosen". */
export const AVATARS = [
  { id: 1, from: "#f9742c", to: "#f20486" },
  { id: 2, from: "#cd4ff2", to: "#5f4aff" },
  { id: 3, from: "#ff39df", to: "#faa0a0" },
  { id: 4, from: "#4f86f2", to: "#ff4a80" },
  { id: 5, from: "#ac51ae", to: "#fb4040" },
  { id: 6, from: "#755bdf", to: "#2c1fa3" },
  { id: 7, from: "#00ffc2", to: "#01d83d" },
] as const;

export interface Profile {
  readonly name: string;
  /** 0 for none, otherwise an id from `AVATARS`. Unknown ids render as none. */
  readonly avatar: number;
}

export const EMPTY_PROFILE: Profile = { name: "", avatar: 0 };

export const profileRegistryAbi = [
  {
    type: "function",
    name: "setProfile",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "avatar", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "profileOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "name", type: "string" },
      { name: "avatar", type: "uint8" },
    ],
  },
] as const;

const contract = { address: yotrade.profileRegistry, abi: profileRegistryAbi } as const;

/** Trims, and rejects what the contract would reject after the trader paid for gas. */
export function parseProfile(name: string, avatar: number): Profile | { readonly error: string } {
  const trimmed = name.trim();
  if (new TextEncoder().encode(trimmed).length > MAX_NAME_BYTES) {
    return { error: "That name is too long" };
  }
  return { name: trimmed, avatar: AVATARS.some((item) => item.id === avatar) ? avatar : 0 };
}

export const isEmpty = (profile: Profile) => profile.name === "" && profile.avatar === 0;

const STORAGE_KEY = "yotrade.profile";

/** A preference, nothing sensitive. Storage can be unavailable in private windows. */
export function loadProfile(): Profile {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Profile> | null;
    const parsed = parseProfile(String(saved?.name ?? ""), Number(saved?.avatar ?? 0));
    return "error" in parsed ? EMPTY_PROFILE : parsed;
  } catch {
    return EMPTY_PROFILE;
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // The choice simply does not survive a reload.
  }
}

/** All profiles in one multicall: the public client batches parallel reads. */
export async function readProfiles(
  publicClient: PublicClient,
  accounts: readonly Address[],
): Promise<Map<string, Profile>> {
  const rows = await Promise.all(
    accounts.map((account) =>
      publicClient.readContract({ ...contract, functionName: "profileOf", args: [account] }),
    ),
  );
  return new Map(
    accounts.map((account, index) => {
      const [name, avatar] = rows[index] ?? ["", 0];
      return [account.toLowerCase(), { name, avatar }];
    }),
  );
}

/** Writes the profile from `wallet` unless the chain already says the same. Waits for the receipt. */
export async function publishProfile(
  publicClient: PublicClient,
  wallet: WalletClient<Transport, Chain, Account>,
  profile: Profile,
): Promise<boolean> {
  const current = (await readProfiles(publicClient, [wallet.account.address])).get(
    wallet.account.address.toLowerCase(),
  );
  if (current?.name === profile.name && current.avatar === profile.avatar) {
    return false;
  }
  const hash = await wallet.writeContract({
    ...contract,
    functionName: "setProfile",
    args: [profile.name, profile.avatar],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction ${hash} reverted`);
  }
  return true;
}
