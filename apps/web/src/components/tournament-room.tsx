"use client";

import { markets } from "@yotrade/core/addresses";
import type { ReactNode } from "react";
import type { Address } from "viem";

import { type Bar, candleShapes, plotOf } from "@/lib/chart.ts";
import { formatPrice } from "@/lib/format.ts";
import { isMarketSlug, MARKET_SLUGS } from "@/lib/markets.ts";
import { PERPS_MARKETS } from "@/lib/perps-markets.ts";
import type { Room, RoomFill } from "@/lib/room.ts";
import { TOKEN_LABELS } from "@/lib/tokens.ts";
import { useLeaderboard } from "@/lib/use-leaderboard.ts";
import { traderName, useProfiles } from "@/lib/use-profiles.ts";
import { useRoom } from "@/lib/use-room.ts";
import { Avatar } from "./ui/avatar.tsx";
import { PerpsIcon } from "./ui/perps-icon.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";
import { TokenIcon } from "./ui/token-icon.tsx";

/** Chart units; the SVG stretches to the card, and markers are placed in percent of the same frame. */
const FRAME = { width: 360, height: 160, padY: 14 };
/** Only the latest fills are pinned to the candles, so the chart reads as trades, not confetti. */
const MARKERS = 8;
const TAPE = 3;
/** One height from the first frame, loading and empty included, so nothing below it ever moves. */
const HEIGHT = "h-[420px]";

const compact = (value: number) =>
  value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });

function ago(seconds: number): string {
  if (seconds < 60) {
    return `${Math.max(0, Math.floor(seconds))}s`;
  }
  if (seconds < 3_600) {
    return `${Math.floor(seconds / 60)}m`;
  }
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3_600)}h`;
  }
  return `${Math.floor(seconds / 86_400)}d`;
}

/** The pair, its mark and the unit sizes are counted in, for either venue. */
function marketOf(slug: Room["market"]): { name: string; unit: string; icon: ReactNode } {
  if (isMarketSlug(slug)) {
    const { base } = markets[MARKET_SLUGS[slug]];
    return {
      name: MARKET_SLUGS[slug],
      unit: TOKEN_LABELS[base],
      icon: <TokenIcon token={base} size={36} />,
    };
  }
  const { label } = PERPS_MARKETS[slug];
  return { name: `${label}-PERP`, unit: label, icon: <PerpsIcon slug={slug} size={36} /> };
}

/** The price when the round opened: the candle holding the start, or the first one shown. */
function openingPrice(bars: readonly Bar[], start: number, step: number): number | undefined {
  return (bars.find((bar) => bar.time + step > start) ?? bars[0])?.open;
}

/**
 * The round as it happens: the busiest market's candles over the tournament, every trader's latest fills pinned to
 * them with their avatar, and a tape of who did what. Polls every five seconds; the card never changes height.
 */
export function TournamentRoom({
  id,
  you,
  now,
}: {
  id: string;
  you: Address | undefined;
  /** The chain clock, in seconds, for "12s ago". */
  now: bigint;
}) {
  const room = useRoom(id, true);
  const board = useLeaderboard(id);
  const traders = [...new Set((room.data?.fills ?? []).map((fill) => fill.trader))];
  const profileOf = useProfiles(traders);

  if (room.isPending) {
    return (
      <Loading label="Loading the round">
        <Skeleton className={`${HEIGHT} rounded-[28px]`} />
      </Loading>
    );
  }
  if (!room.data) {
    if (room.isError) {
      return (
        <p
          role="alert"
          className={`${HEIGHT} flex items-center justify-center rounded-[28px] border border-border bg-surface px-6 text-center text-sm text-ink-muted`}
        >
          The chart is unavailable right now. Retrying…
        </p>
      );
    }
    return null;
  }

  const { market, source, start, step, bars, fills } = room.data;
  const { name, unit, icon } = marketOf(market);
  const last = bars.at(-1)?.close;
  const opening = openingPrice(bars, start, step);
  const change = last !== undefined && opening ? last / opening - 1 : null;
  const rankOf = (trader: Address) => board.data?.find((row) => row.participant === trader)?.rank;
  const nameOf = (trader: Address) => traderName(trader, profileOf(trader), trader === you);

  return (
    <section
      aria-label={`The round so far on ${name}`}
      className={`${HEIGHT} flex flex-col overflow-hidden rounded-[28px] border border-border bg-surface`}
    >
      <header className="flex items-center gap-3 px-4 pb-1 pt-4">
        {icon}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate font-semibold leading-5">{name}</p>
          <Change value={change} />
        </div>
        <p className="tabular shrink-0 text-xl font-semibold">
          {last === undefined ? "—" : `$${formatPrice(last)}`}
        </p>
      </header>

      <Chart bars={bars} start={start} fills={fills} profileOf={profileOf} />
      <p className="h-4 shrink-0 truncate px-4 text-[10px] leading-4 text-ink-muted">{source}</p>

      <ol
        aria-label="Latest fills"
        className="flex flex-1 flex-col justify-start gap-1 px-3 pb-3 pt-1"
      >
        {fills.length === 0 ? (
          <li className="flex flex-1 items-center justify-center text-center text-sm text-ink-muted">
            No trades yet. The first fill lands here.
          </li>
        ) : (
          fills
            .slice(0, TAPE)
            .map((fill) => (
              <TapeRow
                key={fill.id}
                fill={fill}
                unit={unit}
                name={nameOf(fill.trader)}
                avatar={profileOf(fill.trader)?.avatar}
                rank={rankOf(fill.trader)}
                you={fill.trader === you}
                age={Number(now) - fill.time}
              />
            ))
        )}
      </ol>
    </section>
  );
}

function Chart({
  bars,
  start,
  fills,
  profileOf,
}: {
  bars: readonly Bar[];
  start: number;
  fills: readonly RoomFill[];
  profileOf: ReturnType<typeof useProfiles>;
}) {
  const first = bars[0]?.time;
  const lastTime = bars.at(-1)?.time;
  if (first === undefined || lastTime === undefined) {
    return <div className="h-40 shrink-0" />;
  }
  const plot = plotOf(bars, first, lastTime, FRAME);
  const shapes = candleShapes(bars, plot, FRAME);
  const pinned = fills.filter((fill) => fill.time >= first).slice(0, MARKERS);
  const pct = (value: number, of: number) => `${Math.min(100, Math.max(0, (value / of) * 100))}%`;
  return (
    <div className="relative h-40 shrink-0">
      <svg
        viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
        preserveAspectRatio="none"
        aria-hidden
        className="absolute inset-0 size-full"
      >
        {start > first ? (
          <line
            x1={plot.x(start)}
            x2={plot.x(start)}
            y1={0}
            y2={FRAME.height}
            stroke="var(--color-ink-muted)"
            strokeDasharray="3 3"
            strokeOpacity={0.4}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {shapes.map((shape) => (
          <g key={shape.time} className={shape.up ? "text-up" : "text-down"}>
            <line
              x1={shape.x}
              x2={shape.x}
              y1={shape.wickTop}
              y2={shape.wickBottom}
              stroke="currentColor"
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={shape.x - shape.width / 2}
              y={shape.bodyTop}
              width={shape.width}
              height={shape.bodyHeight}
              fill="currentColor"
              rx={1}
            />
          </g>
        ))}
      </svg>
      {pinned.map((fill, index) => (
        <span
          key={fill.id}
          title={`${fill.side === "buy" ? "Bought" : "Sold"} at $${formatPrice(fill.price)}`}
          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ${fill.side === "buy" ? "ring-up" : "ring-down"} ${index === 0 ? "animate-enter" : ""}`}
          style={{
            left: pct(plot.x(fill.time), FRAME.width),
            top: pct(plot.y(fill.price), FRAME.height),
          }}
        >
          <Avatar address={fill.trader} size={20} avatar={profileOf(fill.trader)?.avatar} />
        </span>
      ))}
    </div>
  );
}

function TapeRow({
  fill,
  unit,
  name,
  avatar,
  rank,
  you,
  age,
}: {
  fill: RoomFill;
  unit: string;
  name: string;
  avatar: number | undefined;
  rank: number | undefined;
  you: boolean;
  age: number;
}) {
  return (
    <li
      className={`flex h-12 shrink-0 items-center gap-3 rounded-2xl px-2 ${you ? "bg-accent-soft" : ""}`}
    >
      <Avatar address={fill.trader} size={32} avatar={avatar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-[14px] font-semibold leading-5">
          {rank === undefined ? null : (
            <span className="tabular mr-1.5 font-mono text-xs text-ink-muted">#{rank}</span>
          )}
          {name}
        </p>
        <p
          className={`truncate text-[12px] font-medium ${fill.side === "buy" ? "text-up" : "text-down"}`}
        >
          {fill.side === "buy" ? "Bought" : "Sold"} {compact(fill.size)} {unit}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <p className="tabular font-mono text-[13px]">${formatPrice(fill.price)}</p>
        <p className="text-[12px] text-ink-muted">{ago(age)} ago</p>
      </div>
    </li>
  );
}

/** The move since the round opened; a flat market reads as flat, not as a green zero. */
function Change({ value }: { value: number | null }) {
  if (value === null) {
    return null;
  }
  const pct = (Math.abs(value) * 100).toFixed(2);
  if (pct === "0.00") {
    return (
      <p className="tabular whitespace-nowrap font-mono text-[12px] text-ink-muted">
        0.00% this round
      </p>
    );
  }
  return (
    <p
      className={`tabular whitespace-nowrap font-mono text-[12px] ${value > 0 ? "text-up" : "text-down"}`}
    >
      {value > 0 ? "▲" : "▼"} {pct}% this round
    </p>
  );
}
