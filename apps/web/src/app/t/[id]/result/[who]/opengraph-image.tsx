import { ImageResponse } from "next/og";

import { ACCENT, Brand, Fact, FONTS, OG_SIZE } from "@/lib/og-card.tsx";
import { resultCard } from "@/lib/result-card.ts";
import { loadResult } from "@/server/result.ts";

export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 60;

/** The card a shared result unfurls into: the place, big, and who took it where. */
export default async function Image({ params }: { params: Promise<{ id: string; who: string }> }) {
  const { id, who } = await params;
  const [shared, fonts] = await Promise.all([loadResult(id, who), FONTS]);
  const card = shared?.result ? resultCard(shared.result) : null;
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
      <Brand subtitle={shared?.tournament ?? "trading tournament on Monad"} />
      <div style={{ display: "flex", alignItems: "flex-end", gap: 36 }}>
        <div style={{ fontSize: 200, fontWeight: 800, lineHeight: 0.9, letterSpacing: -6 }}>
          {card?.place ?? "YO"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 16 }}>
          <div style={{ fontSize: 56, fontWeight: 800 }}>{shared?.trader ?? "YoTrade"}</div>
          <div style={{ fontSize: 30, opacity: 0.85 }}>
            {card?.line ?? "Who's the best trader in your community?"}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 24 }}>
        {(card?.facts ?? []).map(([label, value]) => (
          <Fact key={label} label={label} value={value} />
        ))}
      </div>
    </div>,
    { ...size, fonts },
  );
}
