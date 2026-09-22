import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TournamentDetail } from "@/components/tournament-detail.tsx";
import { publicEnv } from "@/lib/env.ts";
import { tournamentMeta } from "@/lib/format.ts";
import { createIndexer } from "@/lib/indexer.ts";

const ID = /^[1-9]\d{0,18}$/;

/** The tournament's name in the tab and in link previews. The indexer is asked once per request. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!ID.test(id)) {
    return {};
  }
  try {
    const tournament = await createIndexer(publicEnv.NEXT_PUBLIC_INDEXER_URL).tournament(
      BigInt(id),
    );
    const name = tournament
      ? tournamentMeta(tournament.id, tournament.metadataURI).name
      : `Tournament #${id}`;
    const description = `Trading tournament on Monad: ${name}`;
    return {
      title: name,
      description,
      openGraph: { title: name, description },
      // The generated card is wide; the default card style in the layout is the square icon.
      twitter: { card: "summary_large_image", title: name, description },
    };
  } catch {
    return { title: `Tournament #${id}` };
  }
}

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) {
    notFound();
  }
  return <TournamentDetail id={id} />;
}
