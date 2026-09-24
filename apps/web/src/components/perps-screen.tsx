"use client";

import { liquidationPrice, notional, pnl } from "@yotrade/plugin-perps/math";
import { useState } from "react";

import { CHART_TYPES, type ChartType, type RangeName } from "@/lib/chart.ts";
import { describeFailure } from "@/lib/describe-failure.ts";
import { leverage, signedUsd, usd } from "@/lib/perps-format.ts";
import { PERPS_MARKETS, type PerpsSlug } from "@/lib/perps-markets.ts";
import { tradeGate } from "@/lib/trade-window.ts";
import { type PerpsPosition, type PerpsSnapshot, usePerpsMarket } from "@/lib/use-perps.ts";
import type { ReferenceSeries } from "@/lib/use-reference.ts";
import { FillsList } from "./fills-list.tsx";
import { ACTION, Headline, RangeTabs } from "./market-screen.tsx";
import { describe, type PerpsSide, PerpsTicket } from "./perps-ticket.tsx";
import { PriceChart } from "./price-chart.tsx";
import { BackButton } from "./ui/back-button.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Dropdown } from "./ui/dropdown.tsx";
import { PerpsIcon } from "./ui/perps-icon.tsx";
import { Sheet } from "./ui/sheet.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";

interface PositionProps {
  readonly position: PerpsPosition;
  readonly snapshot: PerpsSnapshot | undefined;
  readonly label: string;
  readonly pending: boolean;
  /** False once trading has closed: open positions then settle at the end price, nobody closes them. */
  readonly open: boolean;
  onClose(): void;
}

function PositionCard({ position, snapshot, label, pending, open, onClose }: PositionProps) {
  const profit = pnl(position, position.price);
  const others = (snapshot?.risk.notional ?? 0n) - notional(position.size, position.price);
  const liquidation = liquidationPrice(
    snapshot?.risk.equity ?? 0n,
    position.size,
    position.price,
    snapshot?.leverageCap,
    others > 0n ? others : 0n,
  );
  return (
    <Card className="flex flex-col gap-3 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">{describe(position.size, label)}</p>
        <p
          className={`tabular font-mono text-sm font-bold ${profit >= 0n ? "text-up" : "text-down"}`}
        >
          {signedUsd(profit)}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-[13px]">
        {[
          ["Entry", `$${usd(position.entryPrice)}`],
          ["Mark", `$${usd(position.price)}`],
          ["Est. liq.", liquidation ? `$${usd(liquidation)}` : "—"],
        ].map(([name, value]) => (
          <div key={name} className="flex flex-col gap-0.5">
            <dt className="font-medium text-ink-muted">{name}</dt>
            <dd className="tabular font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {open ? (
        <Button variant="secondary" className="min-h-10" pending={pending} onClick={onClose}>
          Close position
        </Button>
      ) : (
        <p className="text-[13px] font-medium text-ink-muted">
          Trading has closed. This position settles at the end price.
        </p>
      )}
    </Card>
  );
}

const STAT_NAMES = ["Equity", "Leverage", "Cash", "Open notional"] as const;

function AccountStats({ snapshot }: { snapshot: PerpsSnapshot | null | undefined }) {
  const values = snapshot
    ? [
        `$${usd(snapshot.risk.equity)}`,
        leverage(snapshot.risk.leverageX100),
        `$${usd(snapshot.balance)}`,
        `$${usd(snapshot.risk.notional)}`,
      ]
    : [];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
      {STAT_NAMES.map((name, index) => (
        <div key={name} className="flex items-center justify-between text-sm">
          <dt className="font-medium text-ink-muted">{name}</dt>
          <dd className="tabular font-semibold">
            {values[index] ?? <Skeleton className="h-4 w-14" />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface BarProps {
  readonly state: "loading" | "joined" | "out" | "failed";
  /** Price and account are known, so an order can be planned. */
  readonly ready: boolean;
  /** Why the buttons are not offered, when they are not. */
  readonly gate: string | null;
  /** An upcoming tournament still lets people join, so its gate comes after the entry. */
  readonly upcoming: boolean;
  onPick(side: PerpsSide): void;
}

function barNote({
  state,
  gate,
  upcoming,
}: Pick<BarProps, "state" | "gate" | "upcoming">): string | null {
  // A tournament that is not running takes nobody, so its window comes before the entry.
  if (gate && !upcoming) {
    return gate;
  }
  if (state === "failed") {
    return "Your entry could not be read from the chain. Retrying…";
  }
  if (state === "out") {
    return "Join this tournament to trade in it.";
  }
  return gate;
}

function TradeBar({ state, ready, gate, upcoming, onPick }: BarProps) {
  const note = state === "loading" ? null : barNote({ state, gate, upcoming });
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-md gap-2 bg-surface/90 px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3 backdrop-blur">
      {state === "loading" ? (
        <Loading label="Loading your account" className="flex w-full gap-2">
          <Skeleton className="h-12 flex-1 rounded-full" />
          <Skeleton className="h-12 flex-1 rounded-full" />
        </Loading>
      ) : null}
      {note ? (
        <p role="status" className="w-full py-3 text-center text-sm font-medium text-ink-muted">
          {note}
        </p>
      ) : null}
      {state === "joined" && note === null ? (
        <>
          <button
            type="button"
            disabled={!ready}
            onClick={() => onPick("Short")}
            className={`${ACTION} bg-ink text-white disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Short
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => onPick("Long")}
            className={`${ACTION} bg-accent text-accent-ink shadow-button hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Long
          </button>
        </>
      ) : null}
    </div>
  );
}

function Notice({ notice }: { notice: { tone: "ok" | "error"; text: string } | undefined }) {
  if (!notice) {
    return null;
  }
  const error = notice.tone === "error";
  return (
    <p
      role={error ? "alert" : "status"}
      className={`animate-enter text-center text-sm font-semibold ${error ? "text-down" : "text-up"}`}
    >
      {notice.text}
    </p>
  );
}

function Chart({ series, type }: { series: ReferenceSeries | undefined; type: ChartType }) {
  if (!series) {
    return (
      <Loading label="Loading chart">
        <Skeleton className="h-60 rounded-2xl" />
      </Loading>
    );
  }
  return (
    <div className="animate-fade">
      <PriceChart bars={series.bars} type={type} />
    </div>
  );
}

/** A futures market: the global chart, the Pyth price you fill at, your position, and Long or Short. */
export function PerpsScreen({ id, slug }: { id: string; slug: PerpsSlug }) {
  const [range, setRange] = useState<RangeName>("15m");
  const [type, setType] = useState<ChartType>("Candles");
  const [side, setSide] = useState<PerpsSide | null>(null);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string }>();
  const market = usePerpsMarket(id, slug, range);
  const { wallet, account, reference, price, position, headline } = market;
  const { name, label } = PERPS_MARKETS[slug];

  async function close() {
    setClosing(true);
    setNotice(undefined);
    try {
      await market.close();
      setNotice({ tone: "ok", text: `${label} position closed` });
    } catch (cause) {
      console.error("perps close failed", cause);
      setNotice({
        tone: "error",
        text: describeFailure(cause, "The position did not close. Try again."),
      });
    } finally {
      setClosing(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-5 pb-24 pt-4">
      <header className="flex items-center gap-3">
        <BackButton />
        <PerpsIcon slug={slug} priority />
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate font-semibold leading-[21px]">{name}</h1>
          <p className="text-sm font-medium text-ink-muted">{label}-PERP · Pyth</p>
        </div>
      </header>

      <div className="flex items-end justify-between gap-3">
        <Headline summary={headline} range={range} loading={reference.isPending || !price} />
        <Dropdown<ChartType>
          label="Chart type"
          options={CHART_TYPES}
          value={type}
          onChange={setType}
        />
      </div>

      <Chart series={reference.data} type={type} />
      <RangeTabs value={range} onChange={setRange} />
      <p className="-mt-2 text-[13px] font-medium leading-5 text-ink-muted">
        Chart: {reference.data?.label ?? "global market"}. Orders fill at the Pyth price above.
      </p>

      {position ? (
        <PositionCard
          position={position}
          snapshot={account.data ?? undefined}
          label={label}
          pending={closing}
          open={tradeGate(market.phase, "") === null}
          onClose={close}
        />
      ) : null}

      {market.state === "joined" ? <AccountStats snapshot={account.data} /> : null}
      {market.state === "joined" && wallet ? (
        <FillsList id={id} trader={wallet.account.address} slug={slug} />
      ) : null}

      {account.isError ? (
        <p role="alert" className="rounded-2xl bg-down/10 p-3 text-sm font-medium text-down">
          Futures prices are not available right now, so your account cannot be valued. Retrying…
        </p>
      ) : null}
      {account.data?.risk.liquidatable ? (
        <p role="alert" className="rounded-2xl bg-down/10 p-3 text-sm font-medium text-down">
          Your equity is under the maintenance margin. Anyone can liquidate this account: reduce
          your positions.
        </p>
      ) : null}
      <Notice notice={notice} />

      <TradeBar
        state={market.state}
        ready={Boolean(price && account.data)}
        gate={tradeGate(market.phase, market.opensIn)}
        upcoming={market.phase === "upcoming"}
        onPick={setSide}
      />

      {wallet && account.data && price ? (
        <Sheet open={side !== null} onClose={() => setSide(null)} label="Order ticket">
          <h2 className="text-xl font-bold leading-[26px] tracking-tight">
            {side ?? "Long"} {label}
          </h2>
          <PerpsTicket
            key={`${slug}-${side}`}
            id={id}
            slug={slug}
            wallet={wallet}
            snapshot={account.data}
            price={price}
            side={side ?? "Long"}
            onSideChange={setSide}
            onDone={(text) => {
              setNotice({ tone: "ok", text });
              setSide(null);
            }}
          />
        </Sheet>
      ) : null}
    </main>
  );
}
