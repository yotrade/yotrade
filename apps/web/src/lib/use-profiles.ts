"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { shortAddress } from "./format.ts";
import { type Profile, readProfiles } from "./profile.ts";
import { useRuntime } from "./use-runtime.ts";

/** Names and avatars of `accounts`, read together. Missing until loaded: callers fall back to the address. */
export function useProfiles(accounts: readonly Address[]) {
  const { publicClient } = useRuntime();
  const key = accounts.map((account) => account.toLowerCase()).sort();
  const { data } = useQuery({
    queryKey: ["profiles", key],
    queryFn: () => readProfiles(publicClient, accounts),
    enabled: accounts.length > 0,
    staleTime: 30_000,
  });
  return (account: Address): Profile | undefined => data?.get(account.toLowerCase());
}

/** What to call a trader: "You", their chosen name, or a short address. */
export function traderName(account: Address, profile: Profile | undefined, you: boolean): string {
  if (you) {
    return "You";
  }
  return profile?.name || shortAddress(account);
}
