"use client";

import { markets } from "@yotrade/core/addresses";
import Link from "next/link";

import { summarize } from "@/lib/chart.ts";
import { MARKET_SLUGS, type MarketSlug } from "@/lib/markets.ts";
import { PERPS_MARKETS, PERPS_SLUGS, type PerpsSlug } from "@/lib/perps-markets.ts";
import { formatBps } from "@/lib/ticket.ts";
import { TOKEN_LABELS } from "@/lib/tokens.ts";
import { useReference } from "@/lib/use-reference.ts";
import type { Venue } from "@/lib/venue.ts";
import { PerpsIcon } from "./ui/perps-icon.tsx";
import { SectionLabel } from "./ui/section-label.tsx";
import { TokenIcon } from "./ui/token-icon.tsx";

const SPOT_SLUGS = Object.keys(MARKET_SLUGS) as MarketSlug[];

function Chip({ id, slug, venue }: { id: string; slug: MarketSlug | PerpsSlug; venue: Venue }) {
  // The global 24 h move, from the cached reference series: what the market is doing right now.
  const reference = useReference(slug, "15m");
  const change = summarize(reference.data?.bars ?? [])?.changeBps;
  const label =
    venue === "futures"
      ? `${PERPS_MARKETS[slug as PerpsSlug].label}-PERP`
      : TOKEN_LABELS[markets[MARKET_SLUGS[slug as MarketSlug]].base];
  return (
    <Link
      href={`/t/${id}/trade/${slug}`}
      className="flex shrink-0 items-center gap-2 rounded-full bg-surface-raised py-1.5 pl-1.5 pr-3 transition duration-200 hover:bg-well focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.98]"
    >
      {venue === "futures" ? (
        <PerpsIcon slug={slug as PerpsSlug} size={28} />
      ) : (
        <TokenIcon token={markets[MARKET_SLUGS[slug as MarketSlug]].base} size={28} />
      )}
      <span className="text-sm font-semibold">{label}</span>
      {change === undefined ? null : (
        <span
          className={`tabular font-mono text-[11px] font-bold ${change >= 0 ? "text-up" : "text-down"}`}
        >
          {formatBps(change)}
        </span>
      )}
    </Link>
  );
}

/** What is being traded here, one tap from the chart. */
export function MarketsStrip({ id, venue }: { id: string; venue: Venue }) {
  const slugs: readonly (MarketSlug | PerpsSlug)[] = venue === "futures" ? PERPS_SLUGS : SPOT_SLUGS;
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Markets in play</SectionLabel>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {slugs.map((slug) => (
          <Chip key={slug} id={id} slug={slug} venue={venue} />
        ))}
      </div>
    </section>
  );
}
