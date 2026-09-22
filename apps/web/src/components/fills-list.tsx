"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import { indexer } from "@/lib/indexer-client.ts";
import { signedUsd, size, usd } from "@/lib/perps-format.ts";
import { PERPS_MARKETS, type PerpsSlug, slugOfFeed } from "@/lib/perps-markets.ts";
import { SectionLabel } from "./ui/section-label.tsx";
import { Loading, Skeleton } from "./ui/skeleton.tsx";

const EXPLORER = "https://testnet.monadvision.com/tx/";

function tone(pnl: bigint): string {
  if (pnl === 0n) {
    return "text-ink-muted";
  }
  return pnl > 0n ? "text-up" : "text-down";
}

const when = (seconds: bigint) =>
  new Date(Number(seconds) * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

interface Props {
  readonly id: string;
  readonly trader: Address;
  /** Only this market's fills, or every market when absent. */
  readonly slug?: PerpsSlug | undefined;
}

/** The trader's own fills from the indexer: what filled, at what price, what it realized. */
export function FillsList({ id, trader, slug }: Props) {
  const { data, isPending } = useQuery({
    queryKey: ["fills", id, trader],
    queryFn: () => indexer.fillsOf(BigInt(id), trader),
    refetchInterval: 5_000,
  });
  const rows = (data ?? []).filter(
    (fill) => slug === undefined || slugOfFeed(fill.market) === slug,
  );

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
        {rows.slice(0, 20).map((fill) => {
          const market = slugOfFeed(fill.market);
          const label = market ? PERPS_MARKETS[market].label : "?";
          const long = fill.sizeDelta > 0n;
          return (
            <li key={fill.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="flex min-w-0 flex-col">
                <p className="truncate font-semibold">
                  <span className={long ? "text-up" : "text-down"}>{long ? "Long" : "Short"}</span>{" "}
                  {size(fill.sizeDelta)} {label}
                  <span className="text-ink-muted"> @ ${usd(fill.price)}</span>
                </p>
                <a
                  href={`${EXPLORER}${fill.tx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="tabular text-xs font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {when(fill.timestamp)} · fee ${usd(fill.fee)} · view tx
                </a>
              </div>
              <p
                className={`tabular shrink-0 font-mono text-[13px] font-bold ${tone(fill.realizedPnl)}`}
              >
                {fill.realizedPnl === 0n ? "—" : signedUsd(fill.realizedPnl)}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
