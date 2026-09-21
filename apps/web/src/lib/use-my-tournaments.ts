"use client";

import { useQuery } from "@tanstack/react-query";

import { type Phase, phaseAt } from "@yotrade/plugin-tournament/phase";

import type { IndexedOwnEntry, IndexedTournament } from "./indexer.ts";
import { indexer } from "./indexer-client.ts";
import { useIdentity } from "./use-identity.tsx";
import { useRuntime } from "./use-runtime.ts";

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
  const { kuru } = useRuntime();
  const main = identity?.wallet.account.address;

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
          const value = open ? (await kuru.portfolio(entry.tradingAccount)).totalUsdc : null;
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
