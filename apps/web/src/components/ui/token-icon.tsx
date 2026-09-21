import type { TokenSymbol } from "@yotrade/core/addresses";
import Image from "next/image";

import { Icon } from "./icon.tsx";

const BADGES: Record<Exclude<TokenSymbol, "usdc" | "mon">, { glyph: string; color: string }> = {
  cbBtc: { glyph: "₿", color: "#f7931a" },
  xaut0: { glyph: "Au", color: "#d4a017" },
  weth: { glyph: "Ξ", color: "#627eea" },
};

/** USDC comes from the kit's icon set and MON is Monad's own mark; the rest get a plain badge. */
export function TokenIcon({ token, size = 40 }: { token: TokenSymbol; size?: number }) {
  if (token === "usdc") {
    return <Icon name="token-usdc" size={size} />;
  }
  if (token === "mon") {
    return (
      <Image
        src="/brands/monad.png"
        alt=""
        aria-hidden
        width={size}
        height={size}
        className="shrink-0 rounded-full"
      />
    );
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
