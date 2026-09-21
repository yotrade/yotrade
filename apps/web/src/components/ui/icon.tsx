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
  | "crown-gold"
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
      // Tiny and everywhere: fetch them with the page. The explicit box keeps non-square marks undistorted.
      loading="eager"
      style={{ width: size, height: size }}
      className={`shrink-0 ${className}`}
    />
  );
}
