import type { Address } from "viem";

import { Avatar } from "./ui/avatar.tsx";
import { Icon } from "./ui/icon.tsx";

export interface PodiumEntry {
  readonly address: Address;
  /** What to call them: "You", a chosen name, or a short address. */
  readonly name: string;
  readonly avatar?: number | undefined;
  /** What the pill under the name says: a return, or a prize. */
  readonly score: string;
  readonly you: boolean;
}

/** Monad's palette, one colour per step: purple for first, cyan for second, orange for third. */
const STEPS = [
  {
    rank: 1,
    ring: "ring-[#6e54ff]",
    block: "from-[#6e54ff]",
    height: "h-40",
    avatar: 84,
    lift: "",
  },
  {
    rank: 2,
    ring: "ring-[#85e6ff]",
    block: "from-[#85e6ff]",
    height: "h-28",
    avatar: 68,
    lift: "pt-10",
  },
  {
    rank: 3,
    ring: "ring-[#ffae45]",
    block: "from-[#ffae45]",
    height: "h-24",
    avatar: 68,
    lift: "pt-14",
  },
] as const;

function Step({ entry, step }: { entry: PodiumEntry | undefined; step: (typeof STEPS)[number] }) {
  if (!entry) {
    return <div className="flex-1" />;
  }
  return (
    <div className={`flex min-w-0 flex-1 animate-enter flex-col items-center ${step.lift}`}>
      <div className="flex h-7 items-end">
        {step.rank === 1 ? <Icon name="crown-gold" size={28} className="animate-float" /> : null}
      </div>
      <span
        className={`mt-1 rounded-full ring-[3px] ring-offset-2 ring-offset-surface ${entry.you ? "ring-ink" : step.ring}`}
      >
        <Avatar address={entry.address} size={step.avatar} avatar={entry.avatar} />
      </span>
      <p className="mt-3 w-full truncate text-center text-sm font-semibold leading-tight">
        {entry.name}
      </p>
      <span className="tabular mt-1.5 rounded-full bg-surface-raised px-2.5 py-0.5 font-mono text-[11px] font-bold shadow-row">
        {entry.score}
      </span>
      <div
        className={`mt-3 grid w-full place-items-start justify-center rounded-t-2xl bg-gradient-to-b to-transparent pt-4 ${step.block} ${step.height}`}
      >
        <span className="text-4xl font-bold leading-none text-white drop-shadow-sm">
          {step.rank}
        </span>
      </div>
    </div>
  );
}

/**
 * Top three on a podium: second, first, third, the way a podium is read. Renders whoever exists, so a single
 * winner stands alone in the centre.
 */
export function Podium({ entries }: { entries: readonly PodiumEntry[] }) {
  const [first, second, third] = entries;
  if (!first) {
    return null;
  }
  return (
    <div
      role="img"
      aria-label={`Podium: ${entries
        .slice(0, 3)
        .map((entry, index) => `${index + 1}. ${entry.name}, ${entry.score}`)
        .join("; ")}`}
      className="flex items-end gap-1 rounded-[32px] bg-gradient-to-b from-accent-soft/60 to-transparent px-3 pt-5"
    >
      <Step entry={second} step={STEPS[1]} />
      <Step entry={first} step={STEPS[0]} />
      <Step entry={third} step={STEPS[2]} />
    </div>
  );
}
