import { type Address, formatEther, type Hex, parseEther } from "viem";
import { privateKeyToAddress } from "viem/accounts";

import { parseServerEnv } from "@/lib/server-env.ts";

/**
 * Below these, a wallet the app spends from is about to stop: the drip after about five top-ups, the others
 * after a handful of transactions.
 */
export const FLOORS = {
  drip: parseEther("2"),
  scorer: parseEther("0.3"),
  liquidator: parseEther("0.3"),
} as const;

export type WalletRole = keyof typeof FLOORS;

export interface WalletState {
  readonly address: Address;
  readonly mon: string;
  readonly low: boolean;
}

/** The server's hot wallets that are configured, by role. Addresses only: keys never leave this function. */
export function hotWallets(): Partial<Record<WalletRole, Address>> {
  const env = parseServerEnv({
    DRIP_PRIVATE_KEY: process.env["DRIP_PRIVATE_KEY"],
    SCORER_PRIVATE_KEY: process.env["SCORER_PRIVATE_KEY"],
    LIQUIDATOR_PRIVATE_KEY: process.env["LIQUIDATOR_PRIVATE_KEY"],
  });
  const keys: Record<WalletRole, string | undefined> = {
    drip: env.DRIP_PRIVATE_KEY,
    scorer: env.SCORER_PRIVATE_KEY,
    liquidator: env.LIQUIDATOR_PRIVATE_KEY,
  };
  return Object.fromEntries(
    Object.entries(keys)
      .filter((entry): entry is [WalletRole, string] => entry[1] !== undefined)
      .map(([role, key]) => [role, privateKeyToAddress(key as Hex)]),
  );
}

/** Each wallet's balance against its floor, and the roles that need a top-up. */
export function walletHealth(
  balances: Partial<Record<WalletRole, { address: Address; balance: bigint }>>,
): {
  wallets: Partial<Record<WalletRole, WalletState>>;
  attention: WalletRole[];
} {
  const wallets: Partial<Record<WalletRole, WalletState>> = {};
  const attention: WalletRole[] = [];
  for (const role of Object.keys(FLOORS) as WalletRole[]) {
    const entry = balances[role];
    if (!entry) {
      continue;
    }
    const low = entry.balance < FLOORS[role];
    wallets[role] = { address: entry.address, mon: formatEther(entry.balance), low };
    if (low) {
      attention.push(role);
    }
  }
  return { wallets, attention };
}
