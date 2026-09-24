import { type MarketSymbol, markets, tokens } from "@yotrade/core/addresses";
import { type Book, valueInQuote } from "@yotrade/plugin-kuru/pricing";
import type { Address, Hex } from "viem";

import { publicEnv } from "@/lib/env.ts";
import { createIndexer, type IndexedTournamentDetail } from "@/lib/indexer.ts";
import { withChainSchedule } from "@/lib/schedule.ts";
import { venueOf } from "@/lib/venue.ts";
import { scorePerps } from "./perps-scoring.ts";
import { serverRuntime } from "./runtime.ts";
import { pnlOf, rank, roiPpm, type Scored, valueAt } from "./scoring.ts";

const CACHE_MS = 5_000;

/** The indexer's entry id: tournament and participant, lowercase. */
const entryKey = (id: bigint, participant: Address) => `${id}-${participant.toLowerCase()}`;
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
  const runtime = serverRuntime();
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

  /**
   * What each entry's trading account received after its join and by the end, in raw USDC: USDC as is, a base
   * token at the last price traded by the time it arrived. A token no market here trades is worth nothing.
   */
  async function capitalAdded(
    id: bigint,
    marks: ReadonlyMap<string, { book: Book; decimals: number }>,
  ): Promise<Map<string, bigint>> {
    const added = new Map<string, bigint>();
    for (const row of await indexer.capitalIn(id)) {
      const value = await valueOfTopUp(row.token, row.amount, row.timestamp, marks);
      added.set(row.entry_id, (added.get(row.entry_id) ?? 0n) + value);
    }
    return added;
  }

  async function valueOfTopUp(
    token: Address,
    amount: bigint,
    timestamp: bigint,
    marks: ReadonlyMap<string, { book: Book; decimals: number }>,
  ): Promise<bigint> {
    if (token.toLowerCase() === tokens.usdc.address.toLowerCase()) {
      return amount;
    }
    const symbol = MARKET_SYMBOLS.find(
      (candidate) => tokens[markets[candidate].base].address.toLowerCase() === token.toLowerCase(),
    );
    const market = symbol ? markets[symbol] : undefined;
    const mark = market ? marks.get(market.orderBook.toLowerCase()) : undefined;
    if (!(market && mark)) {
      return 0n;
    }
    const price = await runtime.kuru.data.priceAt(market.orderBook, Number(timestamp));
    return price === null
      ? valueInQuote(amount, mark.decimals, tokens.usdc.decimals, mark.book)
      : valueAt(amount, price, mark.book.pricePrecision, mark.decimals, tokens.usdc.decimals);
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
    const [indexed, chain] = await Promise.all([
      indexer.tournament(id),
      // The window is the chain's: after a host's Start now the indexer's copy trails by seconds or minutes,
      // and fills in that gap would fall outside it.
      runtime.tournament.get(id).catch(() => null),
    ]);
    if (!indexed) {
      return null;
    }
    const tournament = withChainSchedule(indexed, chain?.config);
    if (venueOf(tournament.venue) === "futures") {
      return computePerps(tournament);
    }
    const ended = BigInt(Math.floor(Date.now() / 1000)) >= tournament.endTime;
    const marks = new Map<string, { book: Book; atEnd: bigint | null; decimals: number }>();
    await Promise.all(
      MARKET_SYMBOLS.map(async (symbol) => {
        const market = markets[symbol];
        const book = await runtime.kuru.market.book(symbol);
        // Live: the mid of the book. Over: the last price traded by the end, so the board stops moving and a
        // finalize an hour later ranks the same as one a second later. A market silent for 30 days before the
        // end has no such price and falls back to the book.
        const atEnd = ended
          ? await runtime.kuru.data.priceAt(market.orderBook, Number(tournament.endTime))
          : null;
        marks.set(market.orderBook.toLowerCase(), {
          book,
          atEnd,
          decimals: tokens[market.base].decimals,
        });
      }),
    );
    const mark = (market: Address, amount: bigint) => {
      const entry = marks.get(market.toLowerCase());
      if (!entry) {
        return 0n;
      }
      if (entry.atEnd === null) {
        return valueInQuote(amount, entry.decimals, tokens.usdc.decimals, entry.book);
      }
      return valueAt(
        amount,
        entry.atEnd,
        entry.book.pricePrecision,
        entry.decimals,
        tokens.usdc.decimals,
      );
    };

    // Start prices only for markets someone already held when the window opened, fetched once each.
    const startPrices = new Map<string, Promise<bigint | null>>();
    const priceAtStart = (market: Address): Promise<bigint | null> => {
      const key = market.toLowerCase();
      let price = startPrices.get(key);
      if (!price) {
        price = runtime.kuru.data.priceAt(market, Number(tournament.startTime));
        startPrices.set(key, price);
      }
      return price;
    };

    const topUps = await capitalAdded(tournament.id, marks);

    const window = { from: tournament.startTime, to: tournament.endTime };
    const rows = await Promise.all(
      tournament.entries.map(async (entry): Promise<Scored> => {
        const performance = await runtime.kuru.data.performance(
          await kuruId(entry.tradingAccount),
          window,
        );
        const opening = new Map<string, bigint | null>();
        for (const position of performance.opening.filter((p) => p.openSize > 0n)) {
          opening.set(position.market.toLowerCase(), await priceAtStart(position.market));
        }
        const pnl = pnlOf(performance, mark, (market, amount) => {
          const price = opening.get(market.toLowerCase());
          const entry = marks.get(market.toLowerCase());
          return price == null || !entry
            ? null
            : valueAt(
                amount,
                price,
                entry.book.pricePrecision,
                entry.decimals,
                tokens.usdc.decimals,
              );
        });
        return {
          participant: entry.participant_id,
          tradingAccount: entry.tradingAccount,
          joinedAt: entry.joinedAt,
          capitalAtJoin: entry.capitalAtJoin,
          pnl,
          // Money added after the join buys no return: it joins the capital the return is measured against.
          roiPpm: roiPpm(
            pnl,
            entry.capitalAtJoin + (topUps.get(entryKey(id, entry.participant_id)) ?? 0n),
          ),
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
