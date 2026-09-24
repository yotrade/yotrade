"use client";

import { useState } from "react";

import { Icon } from "./ui/icon.tsx";

/** Native share where it exists, the clipboard elsewhere. `copied` flips for two seconds after a copy. */
export function useShare() {
  const [copied, setCopied] = useState(false);
  async function share(title: string, path: string) {
    const url = `${window.location.origin}${path}`;
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
  return { share, copied };
}

/** The page itself, as a link. */
export function ShareButton({ title }: { title: string }) {
  const { share, copied } = useShare();
  return (
    <button
      type="button"
      aria-label={copied ? "Link copied" : "Share tournament"}
      onClick={() => share(title, window.location.pathname)}
      className="grid size-10 shrink-0 place-items-center rounded-full bg-well transition duration-200 hover:bg-border focus-visible:outline-2 focus-visible:outline-accent active:scale-95"
    >
      <Icon name={copied ? "check" : "share"} size={18} />
    </button>
  );
}

/** One trader's place, as a link whose card shows it: the brag that brings the next player. */
export function ShareResultButton({
  id,
  participant,
  onAccent,
}: {
  id: bigint;
  participant: string;
  /** On the purple podium card: white on translucent white. Elsewhere: ink on the well. */
  onAccent: boolean;
}) {
  const { share, copied } = useShare();
  const tone = onAccent ? "bg-white/20 hover:bg-white/30" : "bg-well hover:bg-border";
  return (
    <button
      type="button"
      onClick={() => share("My YoTrade result", `/t/${id}/result/${participant}`)}
      className={`mt-2 inline-flex min-h-10 items-center gap-2 rounded-full px-4 font-mono text-[13px] font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] ${tone}`}
    >
      <Icon
        name={copied ? "check" : "share"}
        size={16}
        className={onAccent ? "brightness-0 invert" : ""}
      />
      {copied ? "Link copied" : "Share my result"}
    </button>
  );
}
