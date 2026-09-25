import type { Address } from "viem";

import { serverRuntime } from "./runtime.ts";

const known = new Map<string, bigint>();

/**
 * Kuru's user id for a trading account, remembered once assigned: ids never change, and zero ("not registered
 * yet") is asked again next time. Shared by every server module that reads Kuru's per-user data.
 */
export async function kuruIdOf(account: Address): Promise<bigint> {
  const key = account.toLowerCase();
  const cached = known.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const id = await serverRuntime().kuru.account.id(account);
  if (id !== 0n) {
    known.set(key, id);
  }
  return id;
}
