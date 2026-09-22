"use client";

import { pnl, STARTING_BALANCE } from "@yotrade/plugin-perps/math";
import Link from "next/link";

import { CANDLES, linePath, plotOf, summarize } from "@/lib/chart.ts";
import { leverage, signedUsd, usd } from "@/lib/perps-format.ts";
import {
  feedOf,
  PERPS_MARKETS,
  PERPS_SLUGS,
  type PerpsSlug,
  slugOfFeed,
  toUsdc,
} from "@/lib/perps-markets.ts";
import { formatBps, roiBps } from "@/lib/ticket.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { type PerpsPosition, usePerps } from "@/lib/use-perps.ts";
import { useReference } from "@/lib/use-reference.ts";
import { describe } from "./perps-ticket.tsx";
import { Amount } from "./ui/amount.tsx";
import { BackButton } from "./ui/back-button.tsx";
import { PerpsIcon } from "./ui/perps-icon.tsx";
import { SectionLabel } from "./ui/section-label.tsx";
import { Loading, RowSkeleton, Skeleton } from "./ui/skeleton.tsx";

const SPARK = { width: 56, height: 28, padY: 3 };
const FEEDS = PERPS_SLUGS.map(feedOf);
const ROW =
  "flex items-center gap-3 rounded-2xl bg-surface-raised p-4 transition duration-200 hover:bg-well focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.99]";

function MarketRow({
  id,
  slug,
  price,
}: {
  id: string;
  slug: PerpsSlug;
  price: bigint | undefined;
}) {
  // Ninety-six 15-minute candles: the last 24 hours of the global market.
  const reference = useReference(slug, "15m");
  const { name, label } = PERPS_MARKETS[slug];
  if (reference.isPending || price === undefined) {
    return (
      <Loading label={`Loading ${name}`}>
        <RowSkeleton />
      </Loading>
    );
  }
  // Ninety-six 15-minute candles are the last 24 hours; the series holds more for the chart's zoom.
  const bars = (reference.data?.bars ?? []).slice(-CANDLES);
  const series =
    reference.data && bars[0] ? { ...reference.data, bars, from: bars[0].time } : undefined;
  const summary = summarize(bars);
  const up = (summary?.changeBps ?? 0) >= 0;
  return (
    <Link href={`/t/${id}/trade/${slug}`} className={ROW}>
      <PerpsIcon slug={slug} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate font-semibold leading-[21px]">{label}-PERP</p>
        <p className="truncate text-sm font-medium leading-5 text-ink-muted">{name}</p>
      </div>
      <svg
        viewBox={`0 0 ${SPARK.width} ${SPARK.height}`}
        aria-hidden
        className="h-7 w-14 shrink-0 overflow-visible"
      >
        {series && series.bars.length > 0 ? (
          <path
            d={linePath(series.bars, plotOf(series.bars, series.from, series.to, SPARK), series.to)}
            fill="none"
            className={up ? "stroke-up" : "stroke-down"}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
      </svg>
      <div className="flex shrink-0 flex-col items-end">
        <p className="tabular font-semibold leading-[21px]">${usd(price)}</p>
        <p className={`tabular text-sm font-medium leading-5 ${up ? "text-up" : "text-down"}`}>
          {summary ? `${formatBps(summary.changeBps)} 24h` : "—"}
        </p>
      </div>
    </Link>
  );
}

function PositionRow({ id, position }: { id: string; position: PerpsPosition }) {
  const slug = slugOfFeed(position.market);
  if (!slug) {
    return null;
  }
  const profit = pnl(position, position.price);
  return (
    <Link href={`/t/${id}/trade/${slug}`} className={ROW}>
      <PerpsIcon slug={slug} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate font-semibold leading-[21px]">
          {describe(position.size, PERPS_MARKETS[slug].label)}
        </p>
        <p className="tabular truncate text-sm font-medium leading-5 text-ink-muted">
          Entry ${usd(position.entryPrice)}
        </p>
      </div>
      <p
        className={`tabular font-mono text-sm font-bold ${profit >= 0n ? "text-up" : "text-down"}`}
      >
        {signedUsd(profit)}
      </p>
    </Link>
  );
}

/** Futures: what the account is worth, what it holds, and the markets it can go long or short. */
export function PerpsMarketList({ id }: { id: string }) {
  const { identity } = useIdentity();
  const trader = identity?.tournamentWallet(BigInt(id)).account.address;
  const account = usePerps(id, trader, FEEDS);
  const snapshot = account.data;
  const roi = snapshot ? roiBps(toUsdc(snapshot.risk.equity), toUsdc(STARTING_BALANCE)) : null;

  return (
    <main className="flex flex-1 flex-col gap-6 pb-10 pt-4">
      <header className="flex items-center gap-3">
        <BackButton />
        <h1 className="flex-1 text-xl font-bold leading-[26px] tracking-tight">Futures</h1>
        <span className="rounded-full bg-surface-raised px-3 py-1.5 text-[13px] font-semibold">
          Pyth prices
        </span>
      </header>

      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-ink-muted">Account equity</p>
        {snapshot ? (
          <Amount value={toUsdc(snapshot.risk.equity < 0n ? 0n : snapshot.risk.equity)} size="xl" />
        ) : (
          <Loading label="Loading your account">
            <Skeleton className="h-12 w-44" />
          </Loading>
        )}
        {snapshot && roi !== null ? (
          <p className={`tabular text-sm font-semibold ${roi >= 0 ? "text-up" : "text-down"}`}>
            {formatBps(roi)} since the start · {leverage(snapshot.risk.leverageX100)} leverage
          </p>
        ) : null}
      </div>

      {snapshot && snapshot.positions.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionLabel>Open positions</SectionLabel>
          <ul className="flex flex-col gap-2">
            {snapshot.positions.map((position) => (
              <li key={position.market} className="animate-enter empty:hidden">
                <PositionRow id={id} position={position} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <SectionLabel>Pick a market</SectionLabel>
        <p className="-mt-1 text-[13px] font-medium leading-5 text-ink-muted">
          Go long or short with up to 20x. Everyone started with a virtual $10,000.
        </p>
        <ul className="flex flex-col gap-2">
          {PERPS_SLUGS.map((slug, index) => (
            <li key={slug} className="animate-enter" style={{ animationDelay: `${index * 50}ms` }}>
              <MarketRow
                id={id}
                slug={slug}
                price={snapshot?.prices[feedOf(slug).toLowerCase() as `0x${string}`]}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
