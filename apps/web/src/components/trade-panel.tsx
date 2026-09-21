"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type MarketSymbol, markets, type TokenSymbol, tokens } from "@yotrade/core/addresses";
import { EmptyBookError, PriceImpactError } from "@yotrade/plugin-kuru/errors";
import { DEFAULT_MAX_IMPACT_BPS, type SwapQuote } from "@yotrade/plugin-kuru/plugin";
import { type Book, midPrice } from "@yotrade/plugin-kuru/pricing";
import type { MeraWallet } from "@yotrade/plugin-mera/plugin";
import { type FormEvent, useState } from "react";
import { formatUnits } from "viem";

import { formatToken } from "@/lib/format.ts";
import { formatBps, parseTicket, roiBps } from "@/lib/ticket.ts";
import { useDebounced } from "@/lib/use-debounced.ts";
import { useRuntime } from "@/lib/use-runtime.ts";
import { Amount } from "./ui/amount.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Field } from "./ui/field.tsx";

const MARKET_SYMBOLS = Object.keys(markets) as MarketSymbol[];
/** The deepest book on testnet. Thin books turn ordinary sizes into double-digit price impact. */
const DEFAULT_MARKET: MarketSymbol = "XAUt0/USDC";
const SHORTCUTS = [25n, 50n, 100n] as const;
const LABELS: Record<string, string> = {
  usdc: "USDC",
  cbBtc: "cbBTC",
  mon: "MON",
  xaut0: "XAUt0",
  weth: "WETH",
};

type Side = "Buy" | "Sell";

function bookLine(book: Book | undefined): string {
  if (!book) {
    return "…";
  }
  if (book.hasLiquidity) {
    return `Mid ${midPrice(book).toLocaleString("en-US")} USDC`;
  }
  if (book.hasBid) {
    return "Bids only: you can sell, not buy";
  }
  return book.hasAsk ? "Offers only: you can buy, not sell" : "No liquidity";
}

function failureCopy(cause: unknown): string {
  if (cause instanceof EmptyBookError) {
    return "This market has no liquidity right now.";
  }
  if (cause instanceof PriceImpactError) {
    return "The book is too thin for this size. Nothing was traded. Try a smaller amount.";
  }
  return "The order did not go through. Nothing was traded.";
}

function Toggle<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange(next: T): void;
  label: string;
}) {
  return (
    <fieldset className="flex gap-1 rounded-2xl bg-surface p-1">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={`min-h-10 flex-1 rounded-lg px-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-accent ${option === value ? "bg-surface-raised text-ink ring-2 ring-accent" : "text-ink-muted hover:text-ink"}`}
        >
          {option}
        </button>
      ))}
    </fieldset>
  );
}

interface Portfolio {
  readonly holdings: Record<string, { free: bigint; reserved: bigint }>;
  readonly totalUsdc: bigint;
}

function PortfolioCard({
  portfolio,
  capitalAtJoin,
}: {
  portfolio: Portfolio | undefined;
  capitalAtJoin: bigint;
}) {
  const roi = portfolio ? roiBps(portfolio.totalUsdc, capitalAtJoin) : null;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted">Account value</p>
          {portfolio ? (
            <Amount value={portfolio.totalUsdc} size="xl" />
          ) : (
            <p className="text-5xl font-bold text-ink-muted">…</p>
          )}
        </div>
        {roi === null ? null : (
          <p className={`tabular text-lg font-semibold ${roi >= 0 ? "text-up" : "text-down"}`}>
            {formatBps(roi)}
          </p>
        )}
      </div>
      <ul className="flex flex-wrap gap-2">
        {Object.entries(portfolio?.holdings ?? {})
          .filter(([, holding]) => holding.free + holding.reserved > 0n)
          .map(([symbol, holding]) => (
            <li
              key={symbol}
              className="tabular rounded-full bg-surface px-3 py-1 text-sm font-medium"
            >
              {formatToken(holding.free + holding.reserved, tokens[symbol as TokenSymbol].decimals)}{" "}
              {LABELS[symbol]}
            </li>
          ))}
      </ul>
    </Card>
  );
}

function QuoteLine({ quote, tokenOut }: { quote: SwapQuote; tokenOut: TokenSymbol }) {
  const tooMuch = quote.impactBps > DEFAULT_MAX_IMPACT_BPS;
  return (
    <p className={`tabular text-sm ${tooMuch ? "text-down" : "text-ink-muted"}`} aria-live="polite">
      You receive about {formatToken(quote.quotedOut, tokens[tokenOut].decimals)} {LABELS[tokenOut]}{" "}
      · price impact {(quote.impactBps / 100).toFixed(2)}%
      {tooMuch ? ". Too high for this size: try a smaller amount." : ""}
    </p>
  );
}

export function TradePanel({
  wallet,
  capitalAtJoin,
}: {
  wallet: MeraWallet;
  capitalAtJoin: bigint;
}) {
  const { kuru } = useRuntime();
  const queryClient = useQueryClient();
  const address = wallet.account.address;
  const [market, setMarket] = useState<MarketSymbol>(DEFAULT_MARKET);
  const [side, setSide] = useState<Side>("Buy");
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  const portfolio = useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => kuru.portfolio(address),
    refetchInterval: 3_000,
  });
  const book = useQuery({
    queryKey: ["book", market],
    queryFn: () => kuru.market.book(market),
    refetchInterval: 3_000,
  });

  const base = markets[market].base;
  const isBuy = side === "Buy";
  const tokenIn = isBuy ? "usdc" : base;
  const decimals = tokens[tokenIn].decimals;
  const available = portfolio.data?.holdings[tokenIn]?.free ?? 0n;

  const settledInput = useDebounced(input, 300);
  const settled = parseTicket(settledInput, decimals, available);
  const quote = useQuery({
    queryKey: ["quote", market, side, settled.ok ? settled.amount.toString() : null],
    queryFn: () =>
      settled.ok
        ? kuru.market.quote({ market, side: isBuy ? "buy" : "sell", amountIn: settled.amount })
        : null,
    enabled: settled.ok,
    refetchInterval: 3_000,
    retry: false,
  });
  const canFill = isBuy ? book.data?.hasAsk : book.data?.hasBid;
  const tooMuchImpact = (quote.data?.impactBps ?? 0) > DEFAULT_MAX_IMPACT_BPS;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setDone(undefined);
    const ticket = parseTicket(input, decimals, available);
    if (!ticket.ok) {
      setError(ticket.reason);
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      await kuru.market.swap(wallet, {
        market,
        side: isBuy ? "buy" : "sell",
        amountIn: ticket.amount,
      });
      setDone(isBuy ? `Bought ${LABELS[base]} for ${input} USDC` : `Sold ${input} ${LABELS[base]}`);
      setInput("");
      await queryClient.invalidateQueries({ queryKey: ["portfolio", address] });
    } catch (cause) {
      console.error("swap failed", cause);
      setError(failureCopy(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <PortfolioCard portfolio={portfolio.data} capitalAtJoin={capitalAtJoin} />

      <Card>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <Toggle<MarketSymbol>
            label="Market"
            options={MARKET_SYMBOLS}
            value={market}
            onChange={setMarket}
          />
          <Toggle<Side>
            label="Side"
            options={["Buy", "Sell"] as const}
            value={side}
            onChange={setSide}
          />
          <p className="tabular text-sm text-ink-muted">{bookLine(book.data)}</p>
          <Field
            label={`Amount in ${LABELS[tokenIn]}`}
            inputMode="decimal"
            placeholder="0.00"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            hint={`Available ${formatToken(available, decimals)} ${LABELS[tokenIn]}`}
            {...(error ? { error } : {})}
          />
          <div className="flex gap-2">
            {SHORTCUTS.map((percent) => (
              <Button
                key={percent.toString()}
                variant="secondary"
                className="min-h-10"
                disabled={available === 0n}
                onClick={() => setInput(formatUnits((available * percent) / 100n, decimals))}
              >
                {percent.toString()}%
              </Button>
            ))}
          </div>
          {quote.data && settled.ok ? (
            <QuoteLine quote={quote.data} tokenOut={isBuy ? base : "usdc"} />
          ) : null}
          <Button type="submit" pending={pending} disabled={!canFill || tooMuchImpact}>
            {side} {LABELS[base]}
          </Button>
          {done ? (
            <p role="status" className="text-sm text-up">
              {done}
            </p>
          ) : null}
        </form>
      </Card>
    </section>
  );
}
