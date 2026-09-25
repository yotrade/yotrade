"use client";

import { useQuery } from "@tanstack/react-query";
import { markets } from "@yotrade/core/addresses";
import { midPrice } from "@yotrade/plugin-kuru/pricing";
import Image from "next/image";

import { CANDLES, fillGaps, LOOKBACK_SECONDS, RANGES, summarize, toBars } from "@/lib/chart.ts";
import { formatPrice, formatUsdc } from "@/lib/format.ts";
import { MARKET_SLUGS, type MarketSlug } from "@/lib/markets.ts";
import { TOKEN_LABELS, TOKEN_NAMES } from "@/lib/tokens.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useMyReturn } from "@/lib/use-leaderboard.ts";
import { useRuntime } from "@/lib/use-runtime.ts";
import { GameStatus } from "./game-status.tsx";
import { BackButton } from "./ui/back-button.tsx";
import { MarketCard } from "./ui/market-card.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";
import { TokenIcon } from "./ui/token-icon.tsx";

const SLUGS = Object.keys(MARKET_SLUGS) as MarketSlug[];
/** The newest hourly candles, from whenever a thin testnet market last traded. */
const RANGE = RANGES["1h"];

/** Kuru not answering is not a quiet market; an empty side is not either. */
function marketWarning(failed: boolean, oneSided: boolean): string | undefined {
  if (failed) {
    return "Data unavailable";
  }
  return oneSided ? "One side empty" : undefined;
}

function MarketRow({ id, slug, heldUsdc }: { id: string; slug: MarketSlug; heldUsdc: bigint }) {
  const { kuru } = useRuntime();
  const symbol = MARKET_SLUGS[slug];
  const { orderBook, base } = markets[symbol];

  const data = useQuery({
    queryKey: ["market-row", orderBook],
    refetchInterval: 10_000,
    queryFn: async () => {
      const to = Math.floor(Date.now() / 1000);
      const [info, candles, book] = await Promise.all([
        kuru.data.market(orderBook),
        kuru.data.candles(orderBook, {
          interval: RANGE.interval,
          from: to - LOOKBACK_SECONDS,
          countback: CANDLES,
        }),
        kuru.market.book(symbol),
      ]);
      const bars = fillGaps(toBars(candles, info.pricePrecision), RANGE.seconds, to, CANDLES);
      return {
        from: bars[0]?.time ?? to - RANGE.seconds * CANDLES,
        to,
        bars,
        summary: summarize(bars),
        mid: book.hasLiquidity ? midPrice(book) : null,
        tradable: book.hasLiquidity,
      };
    },
  });

  if (data.isPending) {
    return (
      <Loading label={`Loading ${TOKEN_NAMES[base]}`}>
        <Skeleton className="h-[300px] rounded-3xl" />
      </Loading>
    );
  }
  const price = data.data?.mid ?? data.data?.summary?.close ?? null;
  const oneSided = data.data !== undefined && !data.data.tradable;
  return (
    <MarketCard
      href={`/t/${id}/trade/${slug}`}
      icon={<TokenIcon token={base} size={32} />}
      ticker={TOKEN_LABELS[base]}
      name={TOKEN_NAMES[base]}
      price={price === null ? "—" : `$${formatPrice(price)}`}
      series={data.data ?? null}
      warning={marketWarning(data.isError, oneSided)}
      aside={heldUsdc > 0n ? `You hold $${formatUsdc(heldUsdc)}` : undefined}
    />
  );
}

/** Pick a market first: what it costs now, where it has been, what I already hold. */
export function MarketList({ id }: { id: string }) {
  const { kuru } = useRuntime();
  const { identity } = useIdentity();
  const address = identity?.tournamentWallet(BigInt(id)).account.address;

  const portfolio = useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => (address ? kuru.portfolio(address) : null),
    enabled: address !== undefined,
    refetchInterval: 3_000,
  });
  const roi = useMyReturn(id, address);

  return (
    <main className="flex flex-1 flex-col gap-6 pb-10 pt-4">
      <header className="flex items-center gap-3">
        <BackButton />
        <h1 className="flex-1 text-xl font-bold leading-[26px] tracking-tight">Markets</h1>
        <span className="flex items-center gap-1.5 rounded-full bg-surface-raised py-1 pl-1 pr-3 text-[13px] font-semibold">
          <Image src="/brands/kuru.png" alt="" width={22} height={22} className="rounded-full" />
          Kuru
        </span>
      </header>

      <GameStatus id={id} you={address} returnBps={roi} />

      <ul className="flex flex-col gap-3">
        {SLUGS.map((slug, index) => (
          // A market that is not configured renders nothing: its slot must not leave a gap.
          <li
            key={slug}
            className="animate-enter empty:hidden"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <MarketRow
              id={id}
              slug={slug}
              heldUsdc={portfolio.data?.holdings[markets[MARKET_SLUGS[slug]].base]?.valueUsdc ?? 0n}
            />
          </li>
        ))}
      </ul>

      <p className="text-[12px] font-medium leading-5 text-ink-muted">
        Prices and charts are Kuru testnet fills: what you see is what you trade at.
      </p>
    </main>
  );
}
