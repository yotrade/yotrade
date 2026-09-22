import Image from "next/image";
import type { Address } from "viem";

import { AVATARS } from "@/lib/profile.ts";

/** Monad's brand colours. Two of them, picked by the address, make every trader's gradient. */
const PALETTE = ["#6e54ff", "#85e6ff", "#ff8ee4", "#ffae45", "#b9e3f9", "#ddd7fe"] as const;

function gradientOf(address: Address): string {
  const seed = Number.parseInt(address.slice(2, 10), 16);
  const first = seed % PALETTE.length;
  const second = (seed >>> 8) % PALETTE.length;
  const to = PALETTE[second === first ? (seed + 1) % PALETTE.length : second];
  return `linear-gradient(${seed % 360}deg, ${PALETTE[first]}, ${to})`;
}

interface Props {
  readonly address: Address;
  readonly size?: number;
  /** A kit avatar id from the trader's profile. Anything else falls back to the address gradient. */
  readonly avatar?: number | undefined;
}

/** The kit's avatar: a chosen gradient and 3D shape, or a gradient that is always the same for an address. */
export function Avatar({ address, size = 40, avatar }: Props) {
  const chosen = AVATARS.find((item) => item.id === avatar);
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        backgroundImage: chosen
          ? `linear-gradient(135deg, ${chosen.from}, ${chosen.to})`
          : gradientOf(address),
      }}
    >
      {chosen ? (
        <Image
          src={`/avatars/${chosen.id}.png`}
          alt=""
          width={size}
          height={size}
          loading="eager"
          className="size-[73%]"
        />
      ) : null}
    </span>
  );
}
