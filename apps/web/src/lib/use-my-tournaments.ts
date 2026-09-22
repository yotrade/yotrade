"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { type Phase, phaseAt } from "@yotrade/plugin-tournament/phase";

import type { IndexedOwnEntry, IndexedTournament } from "./indexer.ts";
import { indexer } from "./indexer-client.ts";
import { useIdentity } from "./use-identity.tsx";
import { toUsdc } from "./perps-markets.ts";
import { useRuntime } from "./use-runtime.ts";
import { venueOf } from "./venue.ts";

export interface MyTournament {
  readonly tournament: IndexedTournament;
  readonly entry: IndexedOwnEntry;
  readonly phase: Phase;
  /** Account value in raw USDC. Only read while the account can still change. */
  readonly value: bigint | null;
}

/**
 * The tournaments this passkey joined. Each tournament has its own derived account, so they are found by
 * deriving the address for every listed tournament and asking the indexer which of them have an entry.
 * ponytail: derives up to 50 accounts per load, a few milliseconds each. Index by main account if lists grow.
 */
export function useMyTournaments() {
  const { identity } = useIdentity();
  const { kuru, perps } = useRuntime();
  const main = identity?.wallet.account.address;

  /** What an open account is worth now, in USDC units. Futures cash is what it holds, unmarked. */
  async function valueOf(tournament: IndexedTournament, account: Address): Promise<bigint> {
    if (venueOf(tournament.venue) === "futures") {
      const { balance } = await perps.account(tournament.id, account);
      return toUsdc(balance < 0n ? 0n : balance);
    }
    return (await kuru.portfolio(account)).totalUsdc;
  }

  const tournaments = useQuery({
    queryKey: ["tournaments"],
    queryFn: () => indexer.tournaments(),
    refetchInterval: 5_000,
  });

  const mine = useQuery({
    queryKey: ["my-tournaments", main, tournaments.data?.length ?? 0],
    enabled: identity !== null && tournaments.data !== undefined,
    refetchInterval: 5_000,
    queryFn: async (): Promise<MyTournament[]> => {
      if (!identity || !tournaments.data) {
        return [];
      }
      const byAddress = new Map(
        tournaments.data.map((tournament) => [
          identity.tournamentWallet(tournament.id).account.address.toLowerCase(),
          tournament,
        ]),
      );
      const entries = await indexer.entriesOf([...byAddress.keys()] as `0x${string}`[]);
      const now = BigInt(Math.floor(Date.now() / 1000));
      const rows = await Promise.all(
        entries.map(async (entry): Promise<MyTournament | null> => {
          const tournament = byAddress.get(entry.participant_id.toLowerCase());
          if (!tournament) {
            return null;
          }
          const phase = phaseAt(tournament, now);
          const open = phase === "upcoming" || phase === "live";
          const value = open ? await valueOf(tournament, entry.tradingAccount) : null;
          return { tournament, entry, phase, value };
        }),
      );
      return rows
        .filter((row): row is MyTournament => row !== null)
        .sort((a, b) => Number(b.tournament.id - a.tournament.id));
    },
  });

  return { tournaments, mine };
}
