"use client";

import { useState } from "react";

import { Icon } from "./ui/icon.tsx";

/** Native share where it exists, the clipboard elsewhere. The link is the page itself. */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = `${window.location.origin}${window.location.pathname}`;
    if (navigator.share && (navigator.canShare?.({ url }) ?? true)) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (cause) {
        // Cancelled by the person: nothing else to do. Anything else falls back to the clipboard.
        if (cause instanceof Error && cause.name === "AbortError") {
          return;
        }
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  }
  return (
    <button
      type="button"
      aria-label={copied ? "Link copied" : "Share tournament"}
      onClick={share}
      className="grid size-10 shrink-0 place-items-center rounded-full bg-well transition duration-200 hover:bg-border focus-visible:outline-2 focus-visible:outline-accent active:scale-95"
    >
      <Icon name={copied ? "check" : "share"} size={18} />
    </button>
  );
}
