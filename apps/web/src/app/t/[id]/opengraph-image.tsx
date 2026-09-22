import { ImageResponse } from "next/og";

import { publicEnv } from "@/lib/env.ts";
import { formatUsdc, tournamentMeta } from "@/lib/format.ts";
import { createIndexer, type IndexedTournamentDetail } from "@/lib/indexer.ts";
import { venueOf } from "@/lib/venue.ts";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
/** A card describes a tournament at one moment; a minute of staleness is fine, a fetch per unfurl is not. */
export const revalidate = 60;

const ACCENT = "#6e54ff";
const INK = "#0e091c";
const ID = /^[1-9]\d{0,18}$/;

/** The brand face. Fetched once per instance and cached; the bundled font is the fallback, never an error. */
const FONTS = (async () => {
  const load = async (weight: number) => {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&display=swap`,
      { headers: { "user-agent": "Mozilla/5.0" }, next: { revalidate: 86_400 } },
    ).then((response) => response.text());
    const url = css.match(/src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) {
      throw new Error("No font URL");
    }
    const data = await fetch(url, { next: { revalidate: 86_400 } }).then((response) =>
      response.arrayBuffer(),
    );
    return { name: "Inter", weight: weight as 500 | 800, style: "normal" as const, data };
  };
  try {
    return await Promise.all([load(500), load(800)]);
  } catch {
    return [];
  }
})();

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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "18px 24px",
        borderRadius: 24,
        background: "rgba(255,255,255,0.18)",
      }}
    >
      <div style={{ fontSize: 22, opacity: 0.8, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 800 }}>{value}</div>
    </div>
  );
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
      <div
        style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 32, fontWeight: 800 }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            background: INK,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
          }}
        >
          YO
        </div>
        YoTrade
        <div style={{ fontSize: 24, fontWeight: 500, opacity: 0.8 }}>
          · trading tournament on Monad
        </div>
      </div>
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
