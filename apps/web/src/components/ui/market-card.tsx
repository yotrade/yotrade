import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { areaPath, type Bar, isQuiet, linePath, plotOf } from "@/lib/chart.ts";
import { formatBps } from "@/lib/ticket.ts";

const CHART = { width: 320, height: 56, padY: 6 };

export interface MarketCardProps {
  readonly href: string;
  readonly icon: ReactNode;
  readonly ticker: string;
  readonly name: string;
  /** The market's own colour: the card's wash, the chart's stroke. */
  readonly color: string;
  readonly price: string;
  readonly series: {
    readonly bars: readonly Bar[];
    readonly from: number;
    readonly to: number;
  } | null;
  /** What the change covers, for example "24h". */
  readonly window: string;
  readonly note?: string | undefined;
  /** Left and right buttons: Sell/Buy or Short/Long. Each opens the ticket on its side. */
  readonly actions: readonly [{ label: string; side: string }, { label: string; side: string }];
}

/** A market as a card you can act on: colour, price, an honest chart, and the two sides one tap away. */
export function MarketCard({
  href,
  icon,
  ticker,
  name,
  color,
  price,
  series,
  window,
  note,
  actions,
}: MarketCardProps) {
  const bars = series?.bars ?? [];
  const quiet = isQuiet(bars);
  const first = bars[0];
  const last = bars.at(-1);
  const change =
    first && last && first.open !== 0
      ? Math.round(((last.close - first.open) / first.open) * 10_000)
      : null;
  const up = (change ?? 0) >= 0;
  const plot = series && bars.length > 0 ? plotOf(bars, series.from, series.to, CHART) : null;
  return (
    <article
      className="flex flex-col gap-3 overflow-hidden rounded-3xl p-4"
      style={{
        background: `linear-gradient(160deg, ${color}26 0%, ${color}0d 55%, var(--color-surface-raised) 100%)`,
      }}
    >
      <Link
        href={href as Route}
        className="flex items-center gap-3 rounded-2xl focus-visible:outline-2 focus-visible:outline-accent"
      >
        {icon}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-lg font-bold leading-6">{ticker}</p>
          <p className="truncate text-[13px] font-medium text-ink-muted">{note ?? name}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <p className="tabular text-lg font-bold leading-6">{price}</p>
          {quiet || change === null ? (
            <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
              Quiet market
            </span>
          ) : (
            <span
              className={`tabular rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${up ? "bg-up/15 text-up" : "bg-down/15 text-down"}`}
            >
              {formatBps(change)} {window}
            </span>
          )}
        </div>
      </Link>
      {plot && series && !quiet ? (
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          aria-hidden
          className="h-14 w-full"
          preserveAspectRatio="none"
        >
          <path d={areaPath(bars, plot, series.to, CHART)} fill={color} fillOpacity={0.14} />
          <path
            d={linePath(bars, plot, series.to)}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action, index) => (
          <Link
            key={action.side}
            href={`${href}?side=${action.side}` as Route}
            className={`flex min-h-11 items-center justify-center rounded-full font-mono text-[15px] font-bold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] ${
              index === 0
                ? "bg-ink text-white hover:bg-ink/90"
                : "bg-accent text-accent-ink shadow-button hover:bg-accent-strong"
            }`}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </article>
  );
}
