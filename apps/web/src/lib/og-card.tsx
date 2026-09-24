import type { ReactNode } from "react";

/** The parts every link card shares: the brand colours, the face, the header and the fact tile. */
export const OG_SIZE = { width: 1200, height: 630 };
export const ACCENT = "#6e54ff";
export const INK = "#0e091c";

/** The brand face. Fetched once per instance and cached; the bundled font is the fallback, never an error. */
export const FONTS = (async () => {
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

/** YO mark, name and a subtitle, as the top line of every card. */
export function Brand({ subtitle }: { subtitle: string }) {
  return (
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
      <div style={{ fontSize: 24, fontWeight: 500, opacity: 0.8 }}>{`· ${subtitle}`}</div>
    </div>
  );
}

export function Fact({ label, value }: { label: string; value: ReactNode }) {
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

