import { type MarketSymbol, markets, tokens } from "@yotrade/core/addresses";
import { type Book, valueInQuote } from "@yotrade/plugin-kuru/pricing";
import type { Address, Hex } from "viem";

import { publicEnv } from "@/lib/env.ts";
import { createIndexer, type IndexedTournamentDetail } from "@/lib/indexer.ts";
import { createAppRuntime } from "@/lib/runtime.ts";
import { venueOf } from "@/lib/venue.ts";
import { serverHermes } from "./hermes-options.ts";
import { scorePerps } from "./perps-scoring.ts";
import { pnlOf, rank, roiPpm, type Scored } from "./scoring.ts";

const CACHE_MS = 5_000;
const MARKET_SYMBOLS = Object.keys(markets) as MarketSymbol[];

export interface Leaderboard {
  readonly tournament: IndexedTournamentDetail;
  readonly rows: Scored[];
  readonly computedAt: number;
}

/**
 * Scores every entry of a tournament. Runs on the server so a hundred viewers cost one round of calls to Kuru
 * and the RPC every few seconds, not a hundred.
 * ponytail: cache and in-flight map are per instance. Fine for one server; a shared cache if there are many.
 */
function createLeaderboards() {
  const runtime = createAppRuntime(publicEnv, serverHermes() ?? undefined);
  const indexer = createIndexer(publicEnv.NEXT_PUBLIC_INDEXER_URL);
  const kuruIds = new Map<Address, bigint>();
  const cache = new Map<string, Leaderboard>();
  const inFlight = new Map<string, Promise<Leaderboard | null>>();

  async function kuruId(account: Address): Promise<bigint> {
    const known = kuruIds.get(account);
    if (known !== undefined) {
      return known;
    }
    const id = await runtime.kuru.account.id(account);
    // Ids are assigned once and never change. Zero means "not registered yet", which can change.
    if (id !== 0n) {
      kuruIds.set(account, id);
    }
    return id;
  }

  /** Futures: equity at live prices while it runs, at the end prices once it is over. */
  async function computePerps(tournament: IndexedTournamentDetail): Promise<Leaderboard> {
    const accounts = await Promise.all(
      tournament.entries.map((entry) => runtime.perps.account(tournament.id, entry.tradingAccount)),
    );
    const feeds = [
      ...new Set(accounts.flatMap((account) => account.positions.map((p) => p.market))),
    ];
    const ended = BigInt(Math.floor(Date.now() / 1000)) >= tournament.endTime;
    let prices: Record<Hex, bigint> = {};
    if (feeds.length > 0) {
      const update = ended
        ? await runtime.perps.at(feeds, tournament.endTime)
        : await runtime.perps.latest(feeds);
      prices = Object.fromEntries(
        Object.entries(update.prices).map(([feed, quote]) => [feed, quote.price]),
      );
    }
    const rows = tournament.entries.map((entry, index) =>
      scorePerps(
        {
          participant: entry.participant_id,
          tradingAccount: entry.tradingAccount,
          joinedAt: entry.joinedAt,
          capitalAtJoin: entry.capitalAtJoin,
        },
        accounts[index] ?? { balance: 0n, positions: [] },
        prices,
      ),
    );
    return { tournament, rows: rank(rows), computedAt: Date.now() };
  }

  async function compute(id: bigint): Promise<Leaderboard | null> {
    const tournament = await indexer.tournament(id);
    if (!tournament) {
      return null;
    }
    if (venueOf(tournament.venue) === "futures") {
      return computePerps(tournament);
    }
    const books = new Map<string, { book: Book; decimals: number }>();
    await Promise.all(
      MARKET_SYMBOLS.map(async (symbol) => {
        const market = markets[symbol];
        books.set(market.orderBook.toLowerCase(), {
          book: await runtime.kuru.market.book(symbol),
          decimals: tokens[market.base].decimals,
        });
      }),
    );
    const mark = (market: Address, amount: bigint) => {
      const entry = books.get(market.toLowerCase());
      return entry ? valueInQuote(amount, entry.decimals, tokens.usdc.decimals, entry.book) : 0n;
    };

    const window = { from: tournament.startTime, to: tournament.endTime };
    const rows = await Promise.all(
      tournament.entries.map(async (entry): Promise<Scored> => {
        const performance = await runtime.kuru.data.performance(
          await kuruId(entry.tradingAccount),
          window,
        );
        const pnl = pnlOf(performance, mark);
        return {
          participant: entry.participant_id,
          tradingAccount: entry.tradingAccount,
          joinedAt: entry.joinedAt,
          capitalAtJoin: entry.capitalAtJoin,
          pnl,
          roiPpm: roiPpm(pnl, entry.capitalAtJoin),
          fills: performance.fills,
        };
      }),
    );
    return { tournament, rows: rank(rows), computedAt: Date.now() };
  }

  return function get(id: bigint): Promise<Leaderboard | null> {
    const key = id.toString();
    const cached = cache.get(key);
    // A board computed before the end is marked at live prices. Once the end has passed it must be recomputed
    // at the end prices, or a finalize in those few seconds would rank on the wrong marks.
    const end = cached ? Number(cached.tournament.endTime) * 1000 : 0;
    const crossedEnd = cached !== undefined && cached.computedAt < end && Date.now() >= end;
    if (cached && !crossedEnd && Date.now() - cached.computedAt < CACHE_MS) {
      return Promise.resolve(cached);
    }
    const running = inFlight.get(key);
    if (running) {
      return running;
    }
    const next = compute(id)
      .then((board) => {
        if (board) {
          cache.set(key, board);
        }
        return board;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, next);
    return next;
  };
}

let instance: ReturnType<typeof createLeaderboards> | undefined;

export function getLeaderboard(id: bigint): Promise<Leaderboard | null> {
  instance ??= createLeaderboards();
  return instance(id);
}
