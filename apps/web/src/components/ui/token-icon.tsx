import type { TokenSymbol } from "@yotrade/core/addresses";
import Image from "next/image";

import { Icon } from "./icon.tsx";

/** Official marks where we have them. USDC comes from the kit's icon set. */
const MARKS: Partial<Record<TokenSymbol, string>> = {
  mon: "/brands/monad.png",
  cbBtc: "/brands/cbbtc.png",
  xaut0: "/brands/xaut0.png",
};

export function TokenIcon({ token, size = 40 }: { token: TokenSymbol; size?: number }) {
  const mark = MARKS[token];
  if (mark) {
    return (
      <Image
        src={mark}
        alt=""
        aria-hidden
        width={size}
        height={size}
        className="shrink-0 rounded-full bg-surface"
      />
    );
  }
  if (token === "usdc") {
    return <Icon name="token-usdc" size={size} />;
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-[#627eea] font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      Ξ
    </span>
  );
}
