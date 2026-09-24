import { ImageResponse } from "next/og";

import { publicEnv } from "@/lib/env.ts";
import { formatUsdc, tournamentMeta } from "@/lib/format.ts";
import { createIndexer, type IndexedTournamentDetail } from "@/lib/indexer.ts";
import { ACCENT, Brand, Fact, FONTS, OG_SIZE } from "@/lib/og-card.tsx";
import { venueOf } from "@/lib/venue.ts";

export const size = OG_SIZE;
export const contentType = "image/png";
/** A card describes a tournament at one moment; a minute of staleness is fine, a fetch per unfurl is not. */
export const revalidate = 60;

const ID = /^[1-9]\d{0,18}$/;

const day = (seconds: bigint) =>
  new Date(Number(seconds) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function load(id: string): Promise<IndexedTournamentDetail | null> {
  if (!ID.test(id)) {
    return Promise.resolve(null);
  }
  return createIndexer(publicEnv.NEXT_PUBLIC_INDEXER_URL)
    .tournament(BigInt(id))
    .catch(() => null);
}

/** The alt text names the tournament, so a screen reader hears more than "image". */
export async function generateImageMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tournament = await load(id);
  const name = tournament
    ? tournamentMeta(tournament.id, tournament.metadataURI).name
    : "Tournament";
  return [{ id: "card", alt: `${name} on YoTrade`, size, contentType }];
}

/** The card a link unfurls into: the one number that matters and the facts around it, in the brand. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament, fonts] = await Promise.all([load(id), FONTS]);
  const name = tournament
    ? tournamentMeta(tournament.id, tournament.metadataURI).name
    : "Tournament";
  const facts: [string, string][] = tournament
    ? [
        ["Prize pool", `$${formatUsdc(tournament.prizePool)}`],
        ["Market", venueOf(tournament.venue) === "futures" ? "Futures · Pyth" : "Spot · Kuru"],
        ["Runs", `${day(tournament.startTime)} – ${day(tournament.endTime)}`],
        ["Traders", `${tournament.participantCount}/${tournament.maxParticipants}`],
      ]
    : [];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: ACCENT,
        color: "white",
        fontFamily: fonts.length > 0 ? "Inter" : "sans-serif",
        fontWeight: 500,
      }}
    >
      <Brand subtitle="trading tournament on Monad" />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
          {name}
        </div>
        <div style={{ fontSize: 30, opacity: 0.85 }}>
          {tournament
            ? "Join with a passkey. Everyone starts equal. The contract pays the winners."
            : "Who's the best trader in your community? Find out live on Monad."}
        </div>
      </div>
      <div style={{ display: "flex", gap: 24 }}>
        {facts.map(([label, value]) => (
          <Fact key={label} label={label} value={value} />
        ))}
      </div>
    </div>,
    { ...size, fonts },
  );
}
