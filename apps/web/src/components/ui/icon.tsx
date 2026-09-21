import Image from "next/image";

export type IconName =
  | "arrow"
  | "bell"
  | "check"
  | "chevron-left"
  | "chevron-right"
  | "close"
  | "cog"
  | "credit-card"
  | "crown"
  | "external-link"
  | "face-scan"
  | "gift"
  | "history"
  | "home"
  | "info"
  | "magic-wand"
  | "plus"
  | "qr"
  | "share"
  | "slider"
  | "sparkle"
  | "sparkle-small"
  | "stars"
  | "swap"
  | "timer"
  | "token-usdc"
  | "user"
  | "wallet";

/** Icons extracted from the Ghost kit and recoloured to Monad's purple duotone. Decorative by default. */
export function Icon({
  name,
  size = 24,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={`/icons/${name}.svg`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      unoptimized
      className={`shrink-0 ${className}`}
    />
  );
}
