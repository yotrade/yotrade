import { markets } from "@yotrade/core/addresses";

import {
  type Bar,
  CANDLES,
  fillGaps,
  LOOKBACK_SECONDS,
  RANGES,
  type RangeName,
  toBars,
} from "@/lib/chart.ts";
import { publicEnv } from "@/lib/env.ts";
import { createIndexer, type IndexedTournamentDetail } from "@/lib/indexer.ts";
import { MARKET_SLUGS, type MarketSlug } from "@/lib/markets.ts";
import { type PerpsSlug, slugOfFeed } from "@/lib/perps-markets.ts";
import { busiest, perpsFill, type Room, type RoomFill, rangeFor } from "@/lib/room.ts";
import { withChainSchedule } from "@/lib/schedule.ts";
import { venueOf } from "@/lib/venue.ts";
import { kuruIdOf } from "./kuru-ids.ts";
import { sharedReference } from "./reference.ts";
import { serverRuntime } from "./runtime.ts";

const FILLS_SHOWN = 60;
const CACHE_MS = 5_000;
const SPOT_FALLBACK: MarketSlug = "mon";
const FUTURES_FALLBACK: PerpsSlug = "btc";

/** A fill with the market it traded, which is always one of the venue's slugs. */
type Tagged = RoomFill & { market: MarketSlug | PerpsSlug };

/** The newest fills in one market, without the tag. */
const inMarket = (fills: readonly Tagged[], market: MarketSlug | PerpsSlug): RoomFill[] =>
  fills
    .filter((fill) => fill.market === market)
    .slice(0, FILLS_SHOWN)
    .map(({ market: _, ...fill }) => fill);

/**
 * Builds rooms on the server, so a hundred viewers cost one round of calls to Kuru, the indexer and the reference
 * every few seconds, not a hundred.
 * ponytail: cache and in-flight map are per instance, like the leaderboard's. A shared cache if there are many.
 */
function createRooms() {
  const runtime = serverRuntime();
  const indexer = createIndexer(publicEnv.NEXT_PUBLIC_INDEXER_URL);
  const cache = new Map<string, { at: number; room: Room | null }>();
  const inFlight = new Map<string, Promise<Room | null>>();

  async function spotFills(tournament: IndexedTournamentDetail, to: number): Promise<Tagged[]> {
    const slugs = Object.keys(MARKET_SLUGS) as MarketSlug[];
    const books = new Map(
      await Promise.all(
        slugs.map(async (slug) => {
          const { orderBook } = markets[MARKET_SLUGS[slug]];
          return [
            orderBook.toLowerCase(),
            { slug, info: await runtime.kuru.data.market(orderBook) },
          ] as const;
        }),
      ),
    );
    const start = Number(tournament.startTime);
    const perEntry = await Promise.all(
      tournament.entries.map(async (entry): Promise<Tagged[]> => {
        const userId = await kuruIdOf(entry.tradingAccount);
        if (userId === 0n) {
          return [];
        }
        const trades = await runtime.kuru.data.trades(userId, 100);
        return trades.flatMap((trade) => {
          const book = books.get(trade.market.toLowerCase());
          if (!book || trade.timestamp < start || trade.timestamp > to) {
            return [];
          }
          return [
            {
              id: trade.tradeId,
              market: book.slug,
              trader: entry.participant_id,
              side: trade.isBuy ? "buy" : "sell",
              size: Number(trade.filledSize) / Number(book.info.sizePrecision),
              price: Number(trade.price) / Number(book.info.pricePrecision),
              time: trade.timestamp,
            } satisfies Tagged,
          ];
        });
      }),
    );
    return perEntry.flat().sort((a, b) => b.time - a.time);
  }

  async function futuresFills(tournament: IndexedTournamentDetail, to: number): Promise<Tagged[]> {
    const start = Number(tournament.startTime);
    return (await indexer.fillsIn(tournament.id)).flatMap((row) => {
      const slug = slugOfFeed(row.market);
      const fill = perpsFill(row);
      return slug && fill.time >= start && fill.time <= to ? [{ ...fill, market: slug }] : [];
    });
  }

  async function spotBars(slug: MarketSlug, range: RangeName, to: number): Promise<Bar[]> {
    const { orderBook } = markets[MARKET_SLUGS[slug]];
    const step = RANGES[range].seconds;
    const [info, candles] = await Promise.all([
      runtime.kuru.data.market(orderBook),
      runtime.kuru.data.candles(orderBook, {
        interval: RANGES[range].interval,
        // From whenever the market last traded, so a quiet book still carries its last price into the round.
        from: to - LOOKBACK_SECONDS,
        to,
        countback: 500,
      }),
    ]);
    return fillGaps(toBars(candles, info.pricePrecision), step, to, CANDLES);
  }

  async function compute(id: bigint): Promise<Room | null> {
    const [indexed, chain] = await Promise.all([
      indexer.tournament(id),
      runtime.tournament.get(id).catch(() => null),
    ]);
    if (!indexed) {
      return null;
    }
    const tournament = withChainSchedule(indexed, chain?.config);
    const start = Number(tournament.startTime);
    const end = Math.min(Math.floor(Date.now() / 1000), Number(tournament.endTime));
    if (end <= start) {
      return null;
    }
    const range = rangeFor(end - start);
    const step = RANGES[range].seconds;
    const futures = venueOf(tournament.venue) === "futures";

    if (futures) {
      const fills = await futuresFills(tournament, end);
      const market = busiest<MarketSlug | PerpsSlug>(fills, FUTURES_FALLBACK) as PerpsSlug;
      const series = await sharedReference()(market, range, end);
      return {
        market,
        source: `${series.label} · fills at Pyth prices`,
        start,
        end,
        step,
        bars: series.bars.filter((bar) => bar.time > end - step * CANDLES && bar.time <= end),
        fills: inMarket(fills, market),
      };
    }
    const fills = await spotFills(tournament, end);
    const market = busiest<MarketSlug | PerpsSlug>(fills, SPOT_FALLBACK) as MarketSlug;
    return {
      market,
      source: "Kuru order book",
      start,
      end,
      step,
      bars: await spotBars(market, range, end),
      fills: inMarket(fills, market),
    };
  }

  return function get(id: bigint): Promise<Room | null> {
    const key = id.toString();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return Promise.resolve(hit.room);
    }
    const running = inFlight.get(key);
    if (running) {
      return running;
    }
    const next = compute(id)
      .then((room) => {
        cache.set(key, { at: Date.now(), room });
        return room;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, next);
    return next;
  };
}

let instance: ReturnType<typeof createRooms> | undefined;

export function getRoom(id: bigint): Promise<Room | null> {
  instance ??= createRooms();
  return instance(id);
}
