import Image from "next/image";

import type { PerpsSlug } from "@/lib/perps-markets.ts";

/** The coins' own marks, supplied by the project owner. */
export function PerpsIcon({
  slug,
  size = 40,
  priority = false,
}: {
  slug: PerpsSlug;
  size?: number;
  /** Above the fold as the page's largest image: load it first. */
  priority?: boolean;
}) {
  return (
    <Image
      priority={priority}
      src={`/brands/${slug}.png`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className="shrink-0 rounded-full bg-surface"
    />
  );
}
