"use client";

import { pnl, STARTING_BALANCE } from "@yotrade/plugin-perps/math";
import Link from "next/link";

import { CANDLES } from "@/lib/chart.ts";
import { leverage, signedUsd, usd } from "@/lib/perps-format.ts";
import {
  feedOf,
  PERPS_MARKETS,
  PERPS_SLUGS,
  type PerpsSlug,
  slugOfFeed,
  toUsdc,
} from "@/lib/perps-markets.ts";
import { roiBps } from "@/lib/ticket.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { type PerpsPosition, usePerps } from "@/lib/use-perps.ts";
import { useReference } from "@/lib/use-reference.ts";
import { GameStatus } from "./game-status.tsx";
import { describe } from "./perps-ticket.tsx";
import { BackButton } from "./ui/back-button.tsx";
import { MarketCard } from "./ui/market-card.tsx";
import { PerpsIcon } from "./ui/perps-icon.tsx";
import { SectionLabel } from "./ui/section-label.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";

const FEEDS = PERPS_SLUGS.map(feedOf);
const ROW =
  "flex items-center gap-3 rounded-2xl bg-surface-raised p-4 transition duration-200 hover:bg-well focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.99]";

/** Each market's own colour: Bitcoin orange, Ethereum blue, Solana purple. */
const COLORS: Record<PerpsSlug, string> = { btc: "#f7931a", eth: "#627eea", sol: "#9945ff" };

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
        <Skeleton className="h-[196px] rounded-3xl" />
      </Loading>
    );
  }
  const bars = (reference.data?.bars ?? []).slice(-CANDLES);
  const series =
    reference.data && bars[0] ? { bars, from: bars[0].time, to: reference.data.to } : null;
  return (
    <MarketCard
      href={`/t/${id}/trade/${slug}`}
      icon={<PerpsIcon slug={slug} size={44} />}
      ticker={`${label}-PERP`}
      name={name}
      color={COLORS[slug]}
      price={`$${usd(price)}`}
      series={series}
      window="24h"
      actions={[
        { label: "Short", side: "Short" },
        { label: "Long", side: "Long" },
      ]}
    />
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

      <GameStatus id={id} you={trader} returnBps={roi} />
      {snapshot ? (
        <p className="tabular -mt-3 text-center text-[13px] font-semibold text-ink-muted">
          Equity ${usd(snapshot.risk.equity < 0n ? 0n : snapshot.risk.equity)} ·{" "}
          {leverage(snapshot.risk.leverageX100)} leverage · up to {snapshot.leverageCap.toString()}x
        </p>
      ) : null}

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

      <ul className="flex flex-col gap-3">
        {PERPS_SLUGS.map((slug, index) => (
          <li key={slug} className="animate-enter" style={{ animationDelay: `${index * 60}ms` }}>
            <MarketRow
              id={id}
              slug={slug}
              price={snapshot?.prices[feedOf(slug).toLowerCase() as `0x${string}`]}
            />
          </li>
        ))}
      </ul>

      <p className="text-[12px] font-medium leading-5 text-ink-muted">
        Charts show the global market. Orders fill at the signed Pyth price. Everyone started with a
        virtual $10,000.
      </p>
    </main>
  );
}
