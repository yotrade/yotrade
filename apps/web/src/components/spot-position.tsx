"use client";

import { useQuery } from "@tanstack/react-query";
import { type MarketSymbol, markets, tokens } from "@yotrade/core/addresses";
import type { Address } from "viem";

import { formatToken, formatUsdc } from "@/lib/format.ts";
import { spotPosition } from "@/lib/spot-position.ts";
import { TOKEN_LABELS } from "@/lib/tokens.ts";
import { useRuntime } from "@/lib/use-runtime.ts";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { SectionLabel } from "./ui/section-label.tsx";

interface Props {
  readonly trader: Address;
  readonly market: MarketSymbol;
  readonly holding: {
    readonly free: bigint;
    readonly reserved: bigint;
    readonly valueUsdc: bigint;
  };
  /** Opens the Sell ticket filled with the whole holding. */
  onClose(): void;
}

const signed = (value: bigint) =>
  `${value >= 0n ? "+" : "−"}$${formatUsdc(value < 0n ? -value : value)}`;
/** Cents on dollar prices, six decimals on sub-ten ones: $3,410.30, $0.024025. */
const price = (value: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: value < 10 ? 0 : 2,
    maximumFractionDigits: value < 10 ? 6 : 2,
  });

/** What I hold on this market, what it cost, what it is worth, and the way out. */
export function SpotPositionCard({ trader, market, holding, onClose }: Props) {
  const { kuru } = useRuntime();
  const { orderBook, base } = markets[market];
  const decimals = tokens[base].decimals;
  const positions = useQuery({
    queryKey: ["spot-positions", trader],
    refetchInterval: 5_000,
    queryFn: async () => {
      const id = await kuru.account.id(trader);
      return id === 0n ? [] : kuru.data.positions(id);
    },
  });
  const held = holding.free + holding.reserved;
  if (held === 0n) {
    return null;
  }
  const open = positions.data?.find((row) => row.market.toLowerCase() === orderBook.toLowerCase());
  const { pnl, entry } = spotPosition(held, holding.valueUsdc, decimals, open);
  const mark = Number(holding.valueUsdc) / 1e6 / (Number(held) / 10 ** decimals);
  const cells: [string, string][] = [
    ["Value", `$${formatUsdc(holding.valueUsdc)}`],
    ["Avg. entry", entry === null ? "—" : `$${price(entry)}`],
    ["Mark", `$${price(mark)}`],
  ];
  let tone = "text-ink-muted";
  if (pnl !== null && pnl !== 0n) {
    tone = pnl > 0n ? "text-up" : "text-down";
  }
  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>Position</SectionLabel>
      <Card className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between gap-3">
          <p className="tabular font-semibold">
            {formatToken(held, decimals)} {TOKEN_LABELS[base]}
          </p>
          <p className={`tabular font-mono text-sm font-bold ${tone}`}>
            {pnl === null ? "—" : signed(pnl)}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-[13px]">
          {cells.map(([name, value]) => (
            <div key={name} className="flex flex-col gap-0.5">
              <dt className="font-medium text-ink-muted">{name}</dt>
              <dd className="tabular font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <Button variant="secondary" className="min-h-10" onClick={onClose}>
          Close position
        </Button>
      </Card>
    </section>
  );
}
