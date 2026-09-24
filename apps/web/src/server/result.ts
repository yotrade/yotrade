import { type Address, getAddress, isAddress } from "viem";

import { publicEnv } from "@/lib/env.ts";
import { shortAddress, tournamentMeta } from "@/lib/format.ts";
import { createIndexer } from "@/lib/indexer.ts";
import { readProfiles } from "@/lib/profile.ts";
import type { Result } from "@/lib/result-card.ts";
import { getLeaderboard } from "./leaderboard.ts";
import { serverRuntime } from "./runtime.ts";

const ID = /^[1-9]\d{0,18}$/;

export interface SharedResult {
  readonly tournament: string;
  readonly trader: string;
  /** Null when this address is not in the tournament: the card then shows the tournament alone. */
  readonly result: Result | null;
}

/**
 * One trader's place for a shared link. The posted rank once results are onchain, the board's order before;
 * the return is the board's, which freezes at the end.
 */
export async function loadResult(id: string, who: string): Promise<SharedResult | null> {
  if (!(ID.test(id) && isAddress(who))) {
    return null;
  }
  const trader: Address = getAddress(who);
  const tournament = await createIndexer(publicEnv.NEXT_PUBLIC_INDEXER_URL)
    .tournament(BigInt(id))
    .catch(() => null);
  if (!tournament) {
    return null;
  }
  const [board, profiles] = await Promise.all([
    getLeaderboard(tournament.id).catch(() => null),
    readProfiles(serverRuntime().publicClient, [trader]).catch(() => null),
  ]);
  const name = profiles?.get(trader.toLowerCase())?.name || shortAddress(trader);
  const entry = tournament.entries.find((row) => row.participant_id === trader);
  const index = board?.rows.findIndex((row) => row.participant === trader) ?? -1;
  const row = index >= 0 ? board?.rows[index] : undefined;
  const rank = entry?.rank ?? (index >= 0 ? index + 1 : null);
  return {
    tournament: tournamentMeta(tournament.id, tournament.metadataURI).name,
    trader: name,
    result:
      entry && rank !== null
        ? { rank, of: tournament.participantCount, roiPpm: row?.roiPpm ?? 0, prize: entry.prize }
        : null,
  };
}
