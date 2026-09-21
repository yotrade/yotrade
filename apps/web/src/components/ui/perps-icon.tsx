import { PERPS_MARKETS, type PerpsSlug } from "@/lib/perps-markets.ts";

/** A coin's colour and glyph. No third-party marks to license or keep current. */
export function PerpsIcon({ slug, size = 40 }: { slug: PerpsSlug; size?: number }) {
  const { glyph, tint } = PERPS_MARKETS[slug];
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.45, backgroundColor: tint }}
    >
      {glyph}
    </span>
  );
}
