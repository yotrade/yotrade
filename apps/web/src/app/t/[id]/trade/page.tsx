import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TradeScreen } from "@/components/trade-screen.tsx";

export const metadata: Metadata = { title: "Trade" };

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id)) {
    notFound();
  }
  return <TradeScreen id={id} />;
}
