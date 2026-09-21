import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarketScreen } from "@/components/market-screen.tsx";
import { PerpsScreen } from "@/components/perps-screen.tsx";
import { isMarketSlug, MARKET_SLUGS } from "@/lib/markets.ts";
import { isPerpsSlug } from "@/lib/perps-markets.ts";

export const metadata: Metadata = { title: "Trade" };

export default async function MarketPage({
  params,
}: {
  params: Promise<{ id: string; market: string }>;
}) {
  const { id, market } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id)) {
    notFound();
  }
  // Spot and futures slugs never collide, so the slug names the venue.
  if (isPerpsSlug(market)) {
    return <PerpsScreen id={id} slug={market} />;
  }
  if (!isMarketSlug(market)) {
    notFound();
  }
  return <MarketScreen id={id} market={MARKET_SLUGS[market]} />;
}
