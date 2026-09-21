import type { TokenSymbol } from "@yotrade/core/addresses";

import { Icon } from "./icon.tsx";

const BADGES: Record<Exclude<TokenSymbol, "usdc">, { glyph: string; color: string }> = {
  cbBtc: { glyph: "₿", color: "#f7931a" },
  xaut0: { glyph: "Au", color: "#d4a017" },
  mon: { glyph: "M", color: "#6e54ff" },
  weth: { glyph: "Ξ", color: "#627eea" },
};

/** USDC comes from the kit's icon set; the other tokens get a plain badge in their own colour. */
export function TokenIcon({ token, size = 40 }: { token: TokenSymbol; size?: number }) {
  if (token === "usdc") {
    return <Icon name="token-usdc" size={size} />;
  }
  const { glyph, color } = BADGES[token];
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.4 }}
    >
      {glyph}
    </span>
  );
}
