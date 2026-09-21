import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TradeMarkets } from "@/components/trade-markets.tsx";

export const metadata: Metadata = { title: "Markets" };

export default async function MarketsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id)) {
    notFound();
  }
  return <TradeMarkets id={id} />;
}
