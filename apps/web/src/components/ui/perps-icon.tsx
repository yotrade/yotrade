import Image from "next/image";

import type { PerpsSlug } from "@/lib/perps-markets.ts";

/** The coins' own marks, supplied by the project owner. */
export function PerpsIcon({ slug, size = 40 }: { slug: PerpsSlug; size?: number }) {
  return (
    <Image
      src={`/brands/${slug}.png`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className="shrink-0 rounded-full bg-surface"
    />
  );
}
