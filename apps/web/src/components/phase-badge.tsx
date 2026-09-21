import type { Phase } from "@yotrade/plugin-tournament/phase";

const LABELS: Record<Phase, { text: string; tone: string }> = {
  upcoming: { text: "Upcoming", tone: "border-border text-ink-muted" },
  live: { text: "Live", tone: "border-up/40 bg-up/10 text-up" },
  scoring: { text: "Scoring", tone: "border-accent/40 bg-accent/10 text-accent" },
  dispute: { text: "Results in review", tone: "border-accent/40 bg-accent/10 text-accent" },
  claimable: { text: "Finished", tone: "border-border text-ink-muted" },
  cancelled: { text: "Cancelled", tone: "border-down/40 bg-down/10 text-down" },
  unknown: { text: "Unknown", tone: "border-border text-ink-muted" },
};

export function PhaseBadge({ phase }: { phase: Phase }) {
  const { text, tone } = LABELS[phase];
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {text}
    </span>
  );
}
