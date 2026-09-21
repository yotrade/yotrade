import type { Phase } from "@yotrade/plugin-tournament/phase";

const LABELS: Record<Phase, { text: string; tone: string }> = {
  upcoming: { text: "Upcoming", tone: "bg-well text-ink-muted" },
  live: { text: "Live", tone: "bg-up/10 text-up" },
  scoring: { text: "Scoring", tone: "bg-accent-soft text-accent" },
  dispute: { text: "In review", tone: "bg-accent-soft text-accent" },
  claimable: { text: "Finished", tone: "bg-well text-ink-muted" },
  cancelled: { text: "Cancelled", tone: "bg-down/10 text-down" },
  unknown: { text: "Unknown", tone: "bg-well text-ink-muted" },
};

/** Kit chip: 8 px radius, tight padding, small bold label in the mono face. */
export function PhaseBadge({ phase }: { phase: Phase }) {
  const { text, tone } = LABELS[phase];
  return (
    <span
      className={`whitespace-nowrap rounded-lg px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase ${tone}`}
    >
      {text}
    </span>
  );
}
