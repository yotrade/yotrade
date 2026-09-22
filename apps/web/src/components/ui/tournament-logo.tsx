"use client";

import { useState } from "react";

import { logoSrc } from "@/lib/logo-url.ts";
import { Icon } from "./icon.tsx";

interface Props {
  /** The link from the tournament's metadata, if the host set one. */
  readonly image: string | undefined;
  readonly size?: number;
  readonly className?: string;
  /** Called once with whether the image could be shown; the create form waits for a yes. */
  onStatus?(ok: boolean): void;
}

/**
 * The host's logo in a white circle, through our proxy, or the crown when there is none or it failed.
 * A fixed box on both paths: a broken link never shifts the layout.
 */
export function TournamentLogo({ image, size = 40, className = "", onStatus }: Props) {
  const [failed, setFailed] = useState(false);
  const show = image !== undefined && !failed;
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full ${show ? "bg-white" : "bg-accent"} ${className}`}
      style={{ width: size, height: size }}
    >
      {show ? (
        // Plain <img>: the proxy already bounds the size and type, and `next/image` would need every host listed.
        // biome-ignore lint/performance/noImgElement: proxied, bounded, and host-agnostic
        <img
          key={image}
          src={logoSrc(image)}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          // Contained, so a wide brand mark is small rather than cut.
          className="size-full object-contain p-[12%]"
          onLoad={() => onStatus?.(true)}
          onError={() => {
            setFailed(true);
            onStatus?.(false);
          }}
        />
      ) : (
        <Icon name="crown" size={size / 2} className="brightness-0 invert" />
      )}
    </span>
  );
}
