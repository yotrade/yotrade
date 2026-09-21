"use client";

import { useQuery } from "@tanstack/react-query";
import { markets } from "@yotrade/core/addresses";
import { midPrice } from "@yotrade/plugin-kuru/pricing";
import Image from "next/image";
import Link from "next/link";

import { linePath, plotOf, RANGES, summarize, toBars } from "@/lib/chart.ts";
import { formatUsdc } from "@/lib/format.ts";
import { MARKET_SLUGS, type MarketSlug } from "@/lib/markets.ts";
import { formatBps, roiBps } from "@/lib/ticket.ts";
import { TOKEN_LABELS, TOKEN_NAMES } from "@/lib/tokens.ts";
import { useIdentity } from "@/lib/use-identity.tsx";
import { useReference } from "@/lib/use-reference.ts";
import { useRuntime } from "@/lib/use-runtime.ts";
import { Amount } from "./ui/amount.tsx";
import { BackButton } from "./ui/back-button.tsx";
import { SectionLabel } from "./ui/section-label.tsx";
import { TokenIcon } from "./ui/token-icon.tsx";

const SPARK = { width: 56, height: 28, padY: 3 };
const SLUGS = Object.keys(MARKET_SLUGS) as MarketSlug[];
/** A week of hourly candles: thin testnet markets rarely trade inside a single day. */
const RANGE = RANGES["1W"];

const money = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: value < 10 ? 6 : 2 });

function MarketRow({ id, slug, heldUsdc }: { id: string; slug: MarketSlug; heldUsdc: bigint }) {
  const { kuru } = useRuntime();
  const symbol = MARKET_SLUGS[slug];
  const { orderBook, base } = markets[symbol];

  const data = useQuery({
    queryKey: ["market-row", orderBook],
    refetchInterval: 10_000,
    queryFn: async () => {
      const to = Math.floor(Date.now() / 1000);
      const from = to - RANGE.seconds;
      const [info, candles, book] = await Promise.all([
        kuru.data.market(orderBook),
        kuru.data.candles(orderBook, { interval: RANGE.interval, from }),
        kuru.market.book(symbol),
      ]);
      const bars = toBars(candles, info.pricePrecision);
      return {
        from,
        to,
        bars,
        summary: summarize(bars),
        mid: book.hasLiquidity ? midPrice(book) : null,
      };
    },
  });

  const reference = useReference(slug, "24H");
  // Kuru sets the price you trade at. The line and the change come from the real-world market, labelled so.
  const price = data.data?.mid ?? data.data?.summary?.close ?? null;
  const spark = reference.data ?? data.data;
  const bars = spark?.bars ?? [];
  const summary = summarize(bars);
  const up = (summary?.changeBps ?? 0) >= 0;

  return (
    <Link
      href={`/t/${id}/trade/${slug}`}
      className="flex items-center gap-3 rounded-2xl bg-surface-raised p-4 transition duration-200 hover:bg-well focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.99]"
    >
      <TokenIcon token={base} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate font-semibold leading-[21px]">{TOKEN_NAMES[base]}</p>
        <p className="tabular truncate text-sm font-medium leading-5 text-ink-muted">
          {TOKEN_LABELS[base]}
          {heldUsdc > 0n ? ` · you hold $${formatUsdc(heldUsdc)}` : ""}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${SPARK.width} ${SPARK.height}`}
        aria-hidden
        className="h-7 w-14 shrink-0 overflow-visible"
      >
        {spark && bars.length > 0 ? (
          <path
            d={linePath(bars, plotOf(bars, spark.from, spark.to, SPARK), spark.to)}
            fill="none"
            className={up ? "stroke-up" : "stroke-down"}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : (
          <line
            x1={0}
            x2={SPARK.width}
            y1={16}
            y2={16}
            className="stroke-border"
            strokeDasharray="2 3"
          />
        )}
      </svg>
      <div className="flex shrink-0 flex-col items-end">
        <p className="tabular font-semibold leading-[21px]">
          {price === null ? "—" : `$${money(price)}`}
        </p>
        <p className={`tabular text-sm font-medium leading-5 ${up ? "text-up" : "text-down"}`}>
          {summary
            ? `${formatBps(summary.changeBps)} ${reference.data ? "24h" : "7d"}`
            : "No trades"}
        </p>
      </div>
    </Link>
  );
}

/** Pick a market first: what it costs now, where it has been, what I already hold. */
export function MarketList({ id }: { id: string }) {
  const { kuru, tournament } = useRuntime();
  const { identity } = useIdentity();
  const address = identity?.tournamentWallet(BigInt(id)).account.address;

  const entry = useQuery({
    queryKey: ["entry", id, address],
    queryFn: () => (address ? tournament.entry(BigInt(id), address) : null),
    enabled: address !== undefined,
  });
  const portfolio = useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => (address ? kuru.portfolio(address) : null),
    enabled: address !== undefined,
    refetchInterval: 3_000,
  });
  const roi =
    portfolio.data && entry.data
      ? roiBps(portfolio.data.totalUsdc, entry.data.capitalAtJoin)
      : null;

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

      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-ink-muted">Account value</p>
        {portfolio.data ? (
          <Amount value={portfolio.data.totalUsdc} size="xl" />
        ) : (
          <p className="text-5xl font-bold text-ink-muted">…</p>
        )}
        {roi === null ? null : (
          <p className={`tabular text-sm font-semibold ${roi >= 0 ? "text-up" : "text-down"}`}>
            {formatBps(roi)} since joining
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <SectionLabel>Pick a market</SectionLabel>
        <p className="-mt-1 text-[13px] font-medium leading-5 text-ink-muted">
          Prices are Kuru testnet quotes. Lines and 24h changes follow the global market.
        </p>
        <ul className="flex flex-col gap-2">
          {SLUGS.map((slug, index) => (
            <li key={slug} className="animate-enter" style={{ animationDelay: `${index * 50}ms` }}>
              <MarketRow
                id={id}
                slug={slug}
                heldUsdc={
                  portfolio.data?.holdings[markets[MARKET_SLUGS[slug]].base]?.valueUsdc ?? 0n
                }
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
