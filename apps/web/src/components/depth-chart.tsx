import type { BookRow } from "@/lib/chart.ts";

const WIDTH = 335;
const HEIGHT = 200;

/** Step area of running size from the best price outward, on `x0..x1`. */
function steps(rows: readonly BookRow[], x0: number, x1: number, top: number): string {
  if (rows.length === 0) {
    return "";
  }
  const dx = (x1 - x0) / rows.length;
  let d = `M${x0} ${HEIGHT}`;
  rows.forEach((row, index) => {
    const y = HEIGHT - (row.cumulative / top) * (HEIGHT - 16);
    d += `L${(x0 + dx * index).toFixed(1)} ${y.toFixed(1)}L${(x0 + dx * (index + 1)).toFixed(1)} ${y.toFixed(1)}`;
  });
  return `${d}L${x1} ${HEIGHT}Z`;
}

/** Cumulative depth: bids grow to the left of the mid, asks to the right, on one vertical scale. */
export function DepthChart({ bids, asks }: { bids: readonly BookRow[]; asks: readonly BookRow[] }) {
  const top = Math.max(bids.at(-1)?.cumulative ?? 0, asks.at(-1)?.cumulative ?? 0);
  if (top === 0) {
    return (
      <div className="grid h-52 place-items-center rounded-2xl bg-surface-raised text-sm font-medium text-ink-muted">
        The book is empty
      </div>
    );
  }
  const mid = WIDTH / 2;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Cumulative depth"
      className="w-full"
    >
      <path d={steps(bids, mid, 0, top)} className="fill-up/15 stroke-up" strokeWidth={1.5} />
      <path
        d={steps(asks, mid, WIDTH, top)}
        className="fill-down/15 stroke-down"
        strokeWidth={1.5}
      />
      <line x1={mid} x2={mid} y1={0} y2={HEIGHT} className="stroke-border" strokeDasharray="2 3" />
    </svg>
  );
}
