import type { Route } from "next";
import Link from "next/link";
import { type ReactNode, useId } from "react";

import { areaPath, type Bar, changeOf, isQuiet, linePath, plotOf, spanText } from "@/lib/chart.ts";

const CHART = { width: 320, height: 112, padY: 8 };

export interface MarketCardProps {
  readonly href: string;
  readonly icon: ReactNode;
  readonly ticker: string;
  readonly name: string;
  readonly price: string;
  readonly series: {
    readonly bars: readonly Bar[];
    readonly from: number;
    readonly to: number;
  } | null;
  /** Why the market cannot fully trade right now. Replaces the open pill, in amber. */
  readonly warning?: string | undefined;
  /** A short fact on the right of the footer, such as what you hold. */
  readonly aside?: string | undefined;
}

/** Keyed by the sign of the move. */
const TONES = {
  1: { panel: "bg-up/[0.07]", text: "text-up", stroke: "var(--color-up)" },
  [-1]: { panel: "bg-down/[0.07]", text: "text-down", stroke: "var(--color-down)" },
  0: { panel: "bg-well", text: "text-ink-muted", stroke: "var(--color-ink-muted)" },
} as const;

/** Cents always, and more digits for sub-dollar moves: $3.60, $0.024409. */
const amountText = (value: number) =>
  Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(value) < 1 ? 6 : 2,
  });

/** A market as one tap target: the price and its window's move in a panel tinted by direction. */
export function MarketCard({
  href,
  icon,
  ticker,
  name,
  price,
  series,
  warning,
  aside,
}: MarketCardProps) {
  const gradient = `fade${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const bars = series?.bars ?? [];
  const change = changeOf(bars);
  const tone = TONES[Math.sign(change?.bps ?? 0) as -1 | 0 | 1];
  const plot = series && bars.length > 0 ? plotOf(bars, series.from, series.to, CHART) : null;
  return (
    <Link
      href={href as Route}
      className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 transition duration-200 hover:border-ink/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        {icon}
        <div className="flex min-w-0 flex-col">
          <p className="truncate font-semibold leading-5">{ticker}</p>
          <p className="truncate text-[13px] text-ink-muted">{name}</p>
        </div>
      </div>

      <div className={`flex flex-col overflow-hidden rounded-2xl pt-4 ${tone.panel}`}>
        <div className="px-4">
          <p className="tabular text-2xl font-semibold leading-8">{price}</p>
          {change && series ? (
            <p className={`tabular font-mono text-[13px] ${tone.text}`}>
              {change.amount >= 0 ? "▲" : "▼"} ${amountText(change.amount)} (
              {(Math.abs(change.bps) / 100).toFixed(2)}%) {spanText(series.to - series.from)}
            </p>
          ) : null}
        </div>
        {plot && series ? (
          <svg
            viewBox={`0 0 ${CHART.width} ${CHART.height}`}
            aria-hidden
            className="mt-2 h-28 w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={tone.stroke} stopOpacity={0.22} />
                <stop offset="1" stopColor={tone.stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={areaPath(bars, plot, series.to, CHART)} fill={`url(#${gradient})`} />
            <path
              d={linePath(bars, plot, series.to)}
              fill="none"
              stroke={tone.stroke}
              strokeWidth={1.75}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <div className="h-4" />
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Status warning={warning} quiet={isQuiet(bars)} />
        {aside ? (
          <p className="tabular truncate text-[13px] font-medium text-ink-muted">{aside}</p>
        ) : null}
      </div>
    </Link>
  );
}

function Status({ warning, quiet }: { warning: string | undefined; quiet: boolean }) {
  if (warning) {
    return <Pill dot="bg-amber-500" className="bg-amber-500/10 text-amber-700" label={warning} />;
  }
  if (quiet) {
    return <Pill dot="bg-ink-muted" className="bg-well text-ink-muted" label="Quiet market" />;
  }
  return <Pill dot="bg-up" className="bg-up/10 text-up" label="Market open" />;
}

function Pill({ dot, className, label }: { dot: string; className: string; label: string }) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${className}`}
    >
      <span aria-hidden className={`size-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
