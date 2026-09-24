import type { Metadata } from "next";

import { TournamentDetail } from "@/components/tournament-detail.tsx";
import { resultCard } from "@/lib/result-card.ts";
import { loadResult } from "@/server/result.ts";

/** A shared result opens the tournament itself; only the link card is about the one trader. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; who: string }>;
}): Promise<Metadata> {
  const { id, who } = await params;
  const shared = await loadResult(id, who);
  if (!shared?.result) {
    return {};
  }
  const card = resultCard(shared.result);
  const title = `${shared.trader}: ${card.place} in ${shared.tournament}`;
  return { title, openGraph: { title }, twitter: { card: "summary_large_image", title } };
}

export default async function SharedResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TournamentDetail id={id} />;
}
