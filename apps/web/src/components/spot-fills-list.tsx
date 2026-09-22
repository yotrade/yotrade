"use client";

import { useQuery } from "@tanstack/react-query";
import type { MarketInfo } from "@yotrade/plugin-kuru/data";
import type { Address } from "viem";

import { formatUsdc } from "@/lib/format.ts";
import { useRuntime } from "@/lib/use-runtime.ts";
import { SectionLabel } from "./ui/section-label.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";

const EXPLORER = "https://testnet.monadvision.com/tx/";
const PNL_TO_USDC = 10n ** 12n;

const when = (seconds: number) =>
  new Date(seconds * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

/** A raw amount in the market's precision, with up to six decimals and no trailing noise. */
function scaled(value: bigint, precision: bigint): string {
  const whole = value / precision;
  const fraction = (value % precision).toString().padStart(precision.toString().length - 1, "0");
  const trimmed = fraction.replace(/0+$/, "").slice(0, 6);
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

function tone(pnl: bigint): string {
  if (pnl === 0n) {
    return "text-ink-muted";
  }
  return pnl > 0n ? "text-up" : "text-down";
}

interface Props {
  readonly trader: Address;
  readonly info: MarketInfo;
  readonly base: string;
}

/** The trader's own fills on this market, from Kuru's public trade feed: what filled, at what price, what it realized. */
export function SpotFillsList({ trader, info, base }: Props) {
  const { kuru } = useRuntime();
  const { data, isPending } = useQuery({
    queryKey: ["spot-fills", trader],
    refetchInterval: 5_000,
    queryFn: async () => {
      const id = await kuru.account.id(trader);
      return id === 0n ? [] : kuru.data.trades(id, 50);
    },
  });
  // One order that walks several levels arrives as several records; the last one carries the running PnL.
  const rows = (data ?? []).filter((trade) => trade.symbol === info.symbol);

  if (isPending) {
    return (
      <Loading label="Loading your fills">
        <Skeleton className="h-16 rounded-2xl" />
      </Loading>
    );
  }
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Your fills</SectionLabel>
      <ol className="flex flex-col divide-y divide-border/60 rounded-2xl bg-surface-raised px-4">
        {rows.slice(0, 20).map((trade) => {
          const realized = trade.realizedPnl / PNL_TO_USDC;
          return (
            <li
              key={trade.tradeId}
              className="flex items-center justify-between gap-3 py-2.5 text-sm"
            >
              <div className="flex min-w-0 flex-col">
                <p className="truncate font-semibold">
                  <span className={trade.isBuy ? "text-up" : "text-down"}>
                    {trade.isBuy ? "Buy" : "Sell"}
                  </span>{" "}
                  {scaled(trade.filledSize, info.sizePrecision)} {base}
                  <span className="text-ink-muted">
                    {" "}
                    @ {scaled(trade.price, info.pricePrecision)}
                  </span>
                </p>
                <a
                  href={`${EXPLORER}${trade.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="tabular text-xs font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {when(trade.timestamp)} · fee ${formatUsdc(trade.feeUsdc)} · view tx
                </a>
              </div>
              <p className={`tabular shrink-0 font-mono text-[13px] font-bold ${tone(realized)}`}>
                {realized === 0n
                  ? "—"
                  : `${realized > 0n ? "+" : "−"}$${formatUsdc(realized < 0n ? -realized : realized)}`}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
