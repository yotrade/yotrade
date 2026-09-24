"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { MeraWallet } from "@yotrade/plugin-mera/plugin";
import { maxMargin, type OrderPlan, planOrder } from "@yotrade/plugin-perps/math";
import { type FormEvent, useState } from "react";
import { parseUnits } from "viem";

import { describeFailure } from "@/lib/describe-failure.ts";
import { fundGas } from "@/lib/fund-gas.ts";
import { leverage, size, usd } from "@/lib/perps-format.ts";
import { feedOf, PERPS_MARKETS, type PerpsSlug } from "@/lib/perps-markets.ts";
import type { PerpsSnapshot } from "@/lib/use-perps.ts";
import { useRuntime } from "@/lib/use-runtime.ts";
import { Button } from "./ui/button.tsx";
import { Segmented } from "./ui/segmented.tsx";

export type PerpsSide = "Long" | "Short";
const SIDES = ["Long", "Short"] as const;
/** The multiples on offer; a tournament capped lower shows only the ones under its cap. */
const MULTIPLES = [1n, 2n, 3n, 5n, 10n, 20n, 30n, 50n, 75n, 100n] as const;
const SHORTCUTS = [25n, 50n, 100n] as const;
const CHIP =
  "rounded-lg bg-accent-soft px-2 py-1 font-mono text-[11px] font-bold text-accent transition duration-200 hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

interface Props {
  readonly id: string;
  readonly slug: PerpsSlug;
  readonly wallet: MeraWallet;
  readonly snapshot: PerpsSnapshot;
  readonly price: bigint;
  readonly side: PerpsSide;
  onSideChange(side: PerpsSide): void;
  onDone(message: string): void;
}

/** "Long 0.5 BTC", "Short 2 ETH" or "Flat". */
export function describe(positionSize: bigint, label: string): string {
  if (positionSize === 0n) {
    return "Flat";
  }
  return `${positionSize > 0n ? "Long" : "Short"} ${size(positionSize)} ${label}`;
}

function Row({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="font-medium text-ink-muted">{label}</dt>
      <dd className={`tabular text-right font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

/** Everything the fill will do, or dashes until there is an amount to plan. */
function Details({ plan, price, label }: { plan: OrderPlan | null; price: bigint; label: string }) {
  return (
    <dl className="flex flex-col gap-2.5 rounded-2xl bg-surface-raised p-4">
      <Row label="Size" value={plan ? `${size(plan.sizeDelta)} ${label}` : "—"} />
      <Row label="Fill price · Pyth" value={`$${usd(price)}`} />
      <Row label="Fee · 0.05%" value={plan ? `$${usd(plan.fee)}` : "—"} />
      <Row label="Position after" value={plan ? describe(plan.position.size, label) : "—"} />
      <Row label="Account leverage after" value={plan ? leverage(plan.after.leverageX100) : "—"} />
      <Row
        label="Est. liquidation price"
        value={plan?.liquidationPrice ? `$${usd(plan.liquidationPrice)}` : "—"}
        tone={plan?.liquidationPrice ? "text-down" : ""}
      />
      <Row label="Network fee" value="~0.05 MON · covered" />
    </dl>
  );
}

function problemOf(
  margin: string,
  typed: bigint,
  plan: OrderPlan | null,
  cap: bigint,
): string | undefined {
  if (margin.trim() !== "" && typed === 0n) {
    return "Enter dollars, with cents at most";
  }
  return plan && !plan.withinCap ? `That is more than ${cap}x of your equity` : undefined;
}

/** Margin times leverage is the order. Everything shown is what the contract will compute at this price. */
export function PerpsTicket({
  id,
  slug,
  wallet,
  snapshot,
  price,
  side,
  onSideChange,
  onDone,
}: Props) {
  const { publicClient, perps } = useRuntime();
  const queryClient = useQueryClient();
  const [margin, setMargin] = useState("");
  const [times, setTimes] = useState("5x");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const { label } = PERPS_MARKETS[slug];
  const multiple = BigInt(times.slice(0, -1));

  const cap = snapshot.leverageCap;
  const leverages = MULTIPLES.filter((m) => m <= cap).map((m) => `${m}x`);
  // Margin not already backing open positions, at the tournament's initial requirement.
  const used = snapshot.risk.notional / cap;
  const free = snapshot.risk.equity > used ? snapshot.risk.equity - used : 0n;

  const typed = /^\d+(\.\d{1,2})?$/.test(margin.trim()) ? parseUnits(margin.trim(), 18) : 0n;
  const plan =
    typed > 0n
      ? planOrder({
          balance: snapshot.balance,
          positions: snapshot.positions,
          market: feedOf(slug),
          price,
          side: side === "Long" ? "long" : "short",
          notionalUsd: typed * multiple,
          cap,
        })
      : null;

  const problem = problemOf(margin, typed, plan, cap);

  function shortcut(percent: bigint) {
    // Less 0.2% for the price moving between the quote and the fill.
    const amount = (maxMargin(snapshot.risk, price, cap, multiple) * percent * 998n) / 100_000n;
    setMargin((Number(amount / 10n ** 16n) / 100).toFixed(2));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!plan || problem) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await fundGas(publicClient, wallet.account.address);
      await perps.trade(wallet, {
        tournamentId: BigInt(id),
        market: feedOf(slug),
        sizeDelta: plan.sizeDelta,
      });
      await queryClient.invalidateQueries({ queryKey: ["perps", id] });
      onDone(`${side} ${size(plan.sizeDelta)} ${label} filled`);
    } catch (cause) {
      console.error("perps trade failed", cause);
      setError(describeFailure(cause, "The order did not fill. Nothing changed. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <Segmented<PerpsSide> label="Side" options={SIDES} value={side} onChange={onSideChange} />

      <div className="flex flex-col gap-1 rounded-[18px] bg-well p-1">
        <label className="flex min-h-[72px] items-center gap-3 rounded-2xl bg-surface px-4 shadow-row">
          <span className="flex shrink-0 flex-col">
            <span className="font-semibold leading-tight">Margin</span>
            <span className="tabular text-[11px] font-semibold text-ink-muted">
              Free: ${usd(free)}
            </span>
          </span>
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={margin}
            onChange={(event) => setMargin(event.target.value)}
            aria-invalid={problem ? true : undefined}
            className="tabular min-w-0 flex-1 bg-transparent text-right text-2xl font-bold tracking-tight placeholder:text-ink-muted/50 focus:outline-none"
          />
        </label>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex gap-1">
            {SHORTCUTS.map((percent) => (
              <button
                key={percent.toString()}
                type="button"
                className={CHIP}
                disabled={free === 0n}
                onClick={() => shortcut(percent)}
              >
                {percent === 100n ? "MAX" : `${percent}%`}
              </button>
            ))}
          </div>
          <p className="tabular text-[13px] font-semibold text-ink-muted">
            {free === 0n
              ? "No free margin: reduce a position first"
              : `Order $${plan ? usd(typed * multiple) : "0.00"}`}
          </p>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold tracking-tight">Leverage</legend>
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {leverages.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === times}
              onClick={() => setTimes(option)}
              className={`tabular shrink-0 rounded-full px-3.5 py-2 font-mono text-sm font-bold transition duration-200 focus-visible:outline-2 focus-visible:outline-accent active:scale-95 ${
                option === times ? "bg-ink text-white" : "bg-well text-ink hover:bg-border"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <Details plan={plan} price={price} label={label} />

      {problem || error ? (
        <p role="alert" className="text-sm font-medium text-down">
          {problem ?? error}
        </p>
      ) : null}
      <Button type="submit" pending={pending} disabled={!plan || Boolean(problem)}>
        {side} {label}
      </Button>
      <p className="text-center text-[11px] font-medium leading-4 text-ink-muted">
        Fills at the Pyth price in the block that includes it. 1 {label} ≈ ${usd(price)}
      </p>
    </form>
  );
}
