"use client";

import type { MarketSymbol, TokenSymbol } from "@yotrade/core/addresses";
import Image from "next/image";
import { useState } from "react";

import { CHART_TYPES, type ChartType, RANGES, type RangeName, type Summary } from "@/lib/chart.ts";
import { formatBps } from "@/lib/ticket.ts";
import { TOKEN_LABELS, TOKEN_NAMES } from "@/lib/tokens.ts";
import { tradeGate } from "@/lib/trade-window.ts";
import { type MarketData, useMarket } from "@/lib/use-market.ts";
import { DepthChart } from "./depth-chart.tsx";
import { OrderBook } from "./order-book.tsx";
import { OrderTicket, type Side } from "./order-ticket.tsx";
import { PriceChart } from "./price-chart.tsx";
import { SpotPositionCard } from "./spot-position.tsx";
import { BackButton } from "./ui/back-button.tsx";
import { Dropdown } from "./ui/dropdown.tsx";
import { Segmented } from "./ui/segmented.tsx";
import { Sheet } from "./ui/sheet.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";
import { TokenIcon } from "./ui/token-icon.tsx";

const VIEWS = ["Chart", "Book", "Depth"] as const;
type View = (typeof VIEWS)[number];
const RANGE_NAMES = Object.keys(RANGES) as RangeName[];

const money = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: value < 10 ? 6 : 2 });
/** Volumes run to nine digits on global venues: "126.2M" fits a stat cell, the full number does not. */
const compact = (value: number) =>
  value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
const tone = (bps: number) => (bps >= 0 ? "bg-up/10 text-up" : "bg-down/10 text-down");

function MarketHeader({ base, roi }: { base: TokenSymbol; roi: number | null }) {
  return (
    <header className="flex items-center gap-3">
      <BackButton />
      <TokenIcon token={base} priority />
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate font-semibold leading-[21px]">{TOKEN_NAMES[base]}</h1>
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink-muted">
          {TOKEN_LABELS[base]} / USDC
          <Image
            src="/brands/kuru.png"
            alt="on Kuru"
            width={14}
            height={14}
            className="rounded-full"
          />
        </p>
      </div>
      {roi === null ? null : (
        <span className={`tabular rounded-lg px-2 py-1 font-mono text-xs font-bold ${tone(roi)}`}>
          You {formatBps(roi)}
        </span>
      )}
    </header>
  );
}

interface HeadlineProps {
  readonly summary: Summary | null;
  readonly range: RangeName;
  readonly loading: boolean;
}

export function Headline({ summary, range, loading }: HeadlineProps) {
  if (loading) {
    return (
      <Loading label="Loading price" className="flex flex-col gap-1.5">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </Loading>
    );
  }
  if (!summary) {
    return <p className="text-[32px] font-bold leading-none tracking-tight text-ink-muted">—</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="tabular text-[32px] font-bold leading-none tracking-tight">
        ${money(summary.close)}
      </p>
      <span
        className={`tabular w-fit rounded-full px-2.5 py-0.5 font-mono text-xs font-bold ${tone(summary.changeBps)}`}
      >
        {formatBps(summary.changeBps)} · {range}
      </span>
    </div>
  );
}

function MarketView({ view, type, data }: { view: View; type: ChartType; data: MarketData }) {
  if (view === "Chart" ? data.chartLoading : data.bookLoading) {
    return (
      <Loading label={`Loading ${view.toLowerCase()}`}>
        <Skeleton className={`rounded-2xl ${view === "Depth" ? "h-52" : "h-60"}`} />
      </Loading>
    );
  }
  if (view === "Book") {
    return <OrderBook bids={data.book.bids} asks={data.book.asks} base={TOKEN_LABELS[data.base]} />;
  }
  if (view === "Depth") {
    return <DepthChart bids={data.book.bids} asks={data.book.asks} />;
  }
  return <PriceChart bars={data.bars} type={type} />;
}

export function RangeTabs({
  value,
  onChange,
}: {
  value: RangeName;
  onChange(next: RangeName): void;
}) {
  return (
    <div role="tablist" aria-label="Range" className="flex justify-between">
      {RANGE_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          role="tab"
          aria-selected={name === value}
          onClick={() => onChange(name)}
          className={`rounded-lg px-2 py-1 font-mono text-[13px] font-bold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-accent ${name === value ? "text-ink" : "text-ink-muted/60 hover:text-ink-muted"}`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function Stats({ data }: { data: MarketData }) {
  const { summary, chartLoading } = data;
  const cells: [string, string][] = [
    ["Open", summary ? money(summary.open) : "—"],
    ["High", summary ? money(summary.high) : "—"],
    ["Close", summary ? money(summary.close) : "—"],
    ["Low", summary ? money(summary.low) : "—"],
    ["Volume", summary ? `$${compact(summary.volume)}` : "—"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
      {cells.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between text-sm">
          <dt className="font-medium text-ink-muted">{label}</dt>
          <dd className="tabular font-semibold">
            {chartLoading ? <Skeleton className="h-4 w-14" /> : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export const ACTION =
  "min-h-12 flex-1 rounded-full font-mono text-[15px] font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]";

const BAR_NOTE = "w-full py-3 text-center text-sm font-medium text-ink-muted";

/** What the bar says instead of its buttons, in the order the facts are known. Null means: trade. */
function barNote(data: MarketData): string | null {
  // A tournament that is not running takes nobody, so its window comes before the entry.
  const gate = tradeGate(data.phase, data.opensIn);
  if (gate && data.phase !== "upcoming") {
    return gate;
  }
  if (data.entryFailed) {
    return "Your entry could not be read from the chain. Retrying…";
  }
  if (!data.joined) {
    return "Join this tournament to trade in it.";
  }
  if (data.dataFailed) {
    return "The book could not be read from the chain. Retrying…";
  }
  return gate;
}

function TradeBar({ data, onPick }: { data: MarketData; onPick(side: Side): void }) {
  const note = data.entryPending ? null : barNote(data);
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md gap-2 bg-surface/90 px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 backdrop-blur">
      {note ? (
        <p role="status" className={BAR_NOTE}>
          {note}
        </p>
      ) : null}
      {!data.entryPending && note === null ? (
        <>
          <button
            type="button"
            disabled={!data.canSell}
            onClick={() => onPick("Sell")}
            className={`${ACTION} bg-ink text-white disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {data.canSell ? "Sell" : "No bids"}
          </button>
          <button
            type="button"
            disabled={!data.canBuy}
            onClick={() => onPick("Buy")}
            className={`${ACTION} bg-accent text-accent-ink shadow-button hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {data.canBuy ? "Buy" : "No offers"}
          </button>
        </>
      ) : null}
      {data.entryPending ? (
        <Loading label="Loading your account" className="flex w-full gap-2">
          <Skeleton className="h-12 flex-1 rounded-full" />
          <Skeleton className="h-12 flex-1 rounded-full" />
        </Loading>
      ) : null}
    </div>
  );
}

/** A market the way traders expect it: price, chart, book, depth, and two buttons that open the ticket. */
export function MarketScreen({ id, market }: { id: string; market: MarketSymbol }) {
  const [view, setView] = useState<View>("Chart");
  const [range, setRange] = useState<RangeName>("15m");
  const [type, setType] = useState<ChartType>("Candles");
  const [side, setSide] = useState<Side | null>(null);
  const [closing, setClosing] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [done, setDone] = useState<string>();
  const data = useMarket(id, market, range, view !== "Chart");
  const chart = view === "Chart";

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24 pt-4">
      <MarketHeader base={data.base} roi={data.roi} />
      <Segmented<View> label="View" options={VIEWS} value={view} onChange={setView} />

      <div className="flex items-end justify-between gap-3">
        <Headline summary={data.summary} range={range} loading={data.chartLoading} />
        {chart ? (
          <Dropdown<ChartType>
            label="Chart type"
            options={CHART_TYPES}
            value={type}
            onChange={setType}
          />
        ) : null}
      </div>

      <div key={view} className="animate-enter">
        <MarketView view={view} type={type} data={data} />
      </div>
      {chart ? <RangeTabs value={range} onChange={setRange} /> : null}
      <Stats data={data} />
      {data.joined && data.wallet && data.holding ? (
        <SpotPositionCard
          trader={data.wallet.account.address}
          market={market}
          holding={data.holding}
          minimumUsdc={data.info?.minQuoteNotional ?? 0n}
          open={tradeGate(data.phase, data.opensIn) === null}
          onClose={() => {
            setClosing(true);
            setSide("Sell");
          }}
        />
      ) : null}

      {done ? (
        <p role="status" className="animate-enter text-center text-sm font-semibold text-up">
          {done}
        </p>
      ) : null}

      <TradeBar data={data} onPick={setSide} />

      {data.wallet ? (
        <Sheet
          open={side !== null}
          locked={ordering}
          onClose={() => {
            setSide(null);
            setClosing(false);
          }}
          label="Order ticket"
        >
          <h2 className="text-xl font-bold leading-[26px] tracking-tight">
            {closing ? "Close position" : `${side ?? "Buy"} ${TOKEN_LABELS[data.base]}`}
          </h2>
          <OrderTicket
            // The amount is in the token being paid, so a new side or market starts from an empty field.
            key={`${market}-${side}-${closing}`}
            wallet={data.wallet}
            market={market}
            side={side ?? "Buy"}
            max={closing}
            onPending={setOrdering}
            onSideChange={(next) => {
              setClosing(false);
              setSide(next);
            }}
            onDone={(message) => {
              setDone(message);
              setSide(null);
              setClosing(false);
            }}
          />
        </Sheet>
      ) : null}
    </main>
  );
}
