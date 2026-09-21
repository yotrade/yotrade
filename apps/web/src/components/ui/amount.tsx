import { formatUsdc } from "@/lib/format.ts";

const SIZES = { md: "text-xl", lg: "text-3xl", xl: "text-5xl" } as const;

/** A USDC amount the way a wallet shows a balance: big tabular digits, a small muted currency mark. */
export function Amount({ value, size = "lg" }: { value: bigint; size?: keyof typeof SIZES }) {
  return (
    <p className={`tabular font-bold tracking-tight ${SIZES[size]}`}>
      <span className="mr-0.5 align-top text-[0.45em] font-semibold text-ink-muted">$</span>
      {formatUsdc(value)}
    </p>
  );
}
