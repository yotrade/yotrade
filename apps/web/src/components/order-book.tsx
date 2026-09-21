import type { BookRow } from "@/lib/chart.ts";

const number = (value: number, digits: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: digits });

function Side({ rows, tone, bar }: { rows: readonly BookRow[]; tone: string; bar: string }) {
  if (rows.length === 0) {
    return (
      <p className="py-3 text-center text-sm font-medium text-ink-muted">Nobody on this side</p>
    );
  }
  return (
    <ul className="flex flex-col">
      {rows.map((row) => (
        <li
          key={row.price}
          className="tabular relative grid grid-cols-3 px-3 py-1.5 font-mono text-[13px]"
        >
          <span
            aria-hidden
            className={`absolute inset-y-0.5 right-0 rounded-md ${bar}`}
            style={{ width: `${Math.max(2, row.share * 100)}%` }}
          />
          <span className={`relative font-bold ${tone}`}>
            {number(row.price, row.price < 10 ? 6 : 2)}
          </span>
          <span className="relative text-right">{number(row.size, 4)}</span>
          <span className="relative text-right text-ink-muted">{number(row.cumulative, 4)}</span>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  readonly bids: readonly BookRow[];
  readonly asks: readonly BookRow[];
  readonly base: string;
}

/** Asks above, bids below, the spread between them. Bars show the running size on one shared scale. */
export function OrderBook({ bids, asks, base }: Props) {
  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  const spread =
    bestBid !== undefined && bestAsk !== undefined
      ? `${(((bestAsk - bestBid) / bestAsk) * 100).toFixed(2)}% spread`
      : "One-sided book";

  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-surface-raised py-2">
      <div className="grid grid-cols-3 px-3 pb-1 text-[11px] font-semibold text-ink-muted">
        <span>Price (USDC)</span>
        <span className="text-right">Size ({base})</span>
        <span className="text-right">Total</span>
      </div>
      <Side rows={[...asks].reverse()} tone="text-down" bar="bg-down/10" />
      <p className="tabular border-y border-border/60 py-2 text-center font-mono text-xs font-bold text-ink-muted">
        {spread}
      </p>
      <Side rows={bids} tone="text-up" bar="bg-up/10" />
    </div>
  );
}
