import type { Address, Hash, Hex } from "viem";

import { risk } from "./math.ts";
import type { OpenPosition, PerpsAccount, Wallet } from "./plugin.ts";

/** The slice of the perps plugin a sweep needs. */
export interface LiquidatorPerps {
  leverageCapOf(tournamentId: bigint): Promise<bigint>;
  account(tournamentId: bigint, trader: Address): Promise<PerpsAccount>;
  latest(feeds: readonly Hex[]): Promise<{ prices: Record<Hex, { price: bigint }> }>;
  liquidate(wallet: Wallet, target: { tournamentId: bigint; trader: Address }): Promise<Hash>;
}

export interface LiveTournament {
  readonly id: bigint;
  readonly tradingAccounts: readonly Address[];
}

export interface SweepResult {
  readonly checked: number;
  readonly due: number;
  readonly liquidated: number;
  readonly failed: number;
}

/** Running futures tournaments and who is in them, from the indexer. */
export async function liveFuturesTournaments(
  indexerUrl: string,
  venue: Address,
  nowSeconds: number,
  fetcher: typeof fetch = fetch,
): Promise<LiveTournament[]> {
  const response = await fetcher(indexerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: `query ($venue: String!, $now: numeric!) {
        Tournament(where: { status: { _eq: "OPEN" }, venue: { _eq: $venue }, startTime: { _lte: $now }, endTime: { _gt: $now } }) {
          id
          entries { tradingAccount }
        }
      }`,
      variables: { venue: venue.toLowerCase(), now: nowSeconds },
    }),
  });
  if (!response.ok) {
    throw new Error(`Indexer answered ${response.status}`);
  }
  const body = (await response.json()) as {
    data?: { Tournament: { id: string; entries: { tradingAccount: Address }[] }[] };
    errors?: unknown;
  };
  if (!body.data) {
    throw new Error(`Indexer query failed: ${JSON.stringify(body.errors)}`);
  }
  return body.data.Tournament.map((row) => ({
    id: BigInt(row.id),
    tradingAccounts: row.entries.map((entry) => entry.tradingAccount),
  }));
}

/**
 * Liquidates every account under its maintenance margin in `tournaments`. Anyone may, and rivals are motivated
 * to; this makes sure it happens even when nobody is watching, which at 100x is within minutes. One account
 * that cannot be liquidated right now (a rival got there first, the price moved back, Pyth was stale) is
 * counted and skipped, never allowed to stop the rest.
 */
export async function sweep(
  perps: LiquidatorPerps,
  wallet: Wallet | null,
  tournaments: readonly LiveTournament[],
  log: (line: string) => void = () => undefined,
): Promise<SweepResult> {
  let checked = 0;
  let due = 0;
  let liquidated = 0;
  let failed = 0;
  for (const tournament of tournaments) {
    const cap = await perps.leverageCapOf(tournament.id);
    for (const trader of tournament.tradingAccounts) {
      const open = await perps.account(tournament.id, trader);
      if (open.positions.length === 0) {
        continue;
      }
      checked += 1;
      const { prices } = await perps.latest(open.positions.map((p) => p.market));
      const valued = open.positions.map((p: OpenPosition) => ({
        ...p,
        price: prices[p.market.toLowerCase() as Hex]?.price ?? p.entryPrice,
      }));
      if (!risk(open.balance, valued, cap).liquidatable) {
        continue;
      }
      due += 1;
      if (!wallet) {
        log(`due ${tournament.id} ${trader} at ${cap}x (plan only)`);
        continue;
      }
      try {
        const hash = await perps.liquidate(wallet, { tournamentId: tournament.id, trader });
        liquidated += 1;
        log(`liquidated ${tournament.id} ${trader} ${hash}`);
      } catch (cause) {
        failed += 1;
        log(`failed ${tournament.id} ${trader}: ${(cause as Error).message.split("\n")[0]}`);
      }
    }
  }
  return { checked, due, liquidated, failed };
}
