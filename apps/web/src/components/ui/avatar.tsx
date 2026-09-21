import type { Address } from "viem";

/** Monad's brand colours. Two of them, picked by the address, make every trader's gradient. */
const PALETTE = ["#6e54ff", "#85e6ff", "#ff8ee4", "#ffae45", "#b9e3f9", "#ddd7fe"] as const;

/** The kit's gradient avatar, made deterministic: the same address always gets the same colours. */
export function Avatar({ address, size = 40 }: { address: Address; size?: number }) {
  const seed = Number.parseInt(address.slice(2, 10), 16);
  const from = PALETTE[seed % PALETTE.length];
  const to =
    PALETTE[
      (seed >>> 8) % PALETTE.length === seed % PALETTE.length
        ? (seed + 1) % PALETTE.length
        : (seed >>> 8) % PALETTE.length
    ];
  return (
    <span
      aria-hidden
      className="block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        backgroundImage: `linear-gradient(${seed % 360}deg, ${from}, ${to})`,
      }}
    />
  );
}
