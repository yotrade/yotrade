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
import { Icon } from "./ui/icon.tsx";
import { TokenIcon } from "./ui/token-icon.tsx";

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
    <fieldset className="flex gap-1 rounded-[18px] bg-well p-1">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={`min-h-10 flex-1 rounded-2xl px-2 font-mono text-[13px] font-semibold transition focus-visible:outline-2 focus-visible:outline-accent ${option === value ? "bg-surface text-ink shadow-row ring-2 ring-accent" : "text-ink-muted hover:text-ink"}`}
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-ink-muted">Account value</p>
        {portfolio ? (
          <Amount value={portfolio.totalUsdc} size="xl" />
        ) : (
          <p className="text-5xl font-bold text-ink-muted">…</p>
        )}
        {roi === null ? null : (
          <p className={`tabular text-sm font-semibold ${roi >= 0 ? "text-up" : "text-down"}`}>
            {formatBps(roi)} since joining
          </p>
        )}
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {Object.entries(portfolio?.holdings ?? {})
          .filter(([, holding]) => holding.free + holding.reserved > 0n)
          .map(([symbol, holding]) => (
            <li
              key={symbol}
              className="tabular flex items-center gap-1.5 rounded-full bg-well py-1 pl-1 pr-3 text-sm font-semibold"
            >
              <TokenIcon token={symbol as TokenSymbol} size={24} />
              {formatToken(holding.free + holding.reserved, tokens[symbol as TokenSymbol].decimals)}{" "}
              {LABELS[symbol]}
            </li>
          ))}
      </ul>
    </div>
  );
}

function InfoCard({
  book,
  quote,
}: {
  book: Book | undefined;
  quote: SwapQuote | null | undefined;
}) {
  const tooMuch = (quote?.impactBps ?? 0) > DEFAULT_MAX_IMPACT_BPS;
  return (
    <Card className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center justify-between text-sm font-medium">
        <span className="text-ink-muted">Market</span>
        <span className="tabular">{bookLine(book)}</span>
      </div>
      <div className="flex items-center justify-between text-sm font-medium">
        <span className="text-ink-muted">Price impact</span>
        <span className={`tabular ${tooMuch ? "font-bold text-down" : ""}`}>
          {quote ? `${(quote.impactBps / 100).toFixed(2)}%` : "—"}
        </span>
      </div>
      {tooMuch ? (
        <p className="text-[13px] leading-5 text-down">
          Too high for this size: try a smaller amount.
        </p>
      ) : null}
    </Card>
  );
}

function ReceiveRow({ token, amount }: { token: TokenSymbol; amount: bigint | undefined }) {
  return (
    <div className="flex min-h-[72px] items-center gap-2 px-4">
      <TokenIcon token={token} />
      <div className="flex flex-col">
        <span className="font-semibold leading-tight">{LABELS[token]}</span>
        <span className="text-[11px] font-semibold text-ink-muted">You receive about</span>
      </div>
      <p
        className={`tabular flex-1 text-right text-xl font-bold ${amount === undefined ? "text-border" : ""}`}
      >
        {amount === undefined ? "0" : formatToken(amount, tokens[token].decimals)}
      </p>
    </div>
  );
}

const CHIP =
  "rounded-lg bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent disabled:opacity-40";

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
  const tokenOut: TokenSymbol = isBuy ? base : "usdc";
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

      <form className="flex flex-col gap-3" onSubmit={submit}>
        <Toggle<MarketSymbol>
          label="Market"
          options={MARKET_SYMBOLS}
          value={market}
          onChange={setMarket}
        />

        {/* Kit exchange field: a grey well holding two white rows, with the flip button on the seam. */}
        <div className="relative flex flex-col gap-1 rounded-[18px] bg-well p-1">
          <div className="flex min-h-[72px] items-center gap-2 rounded-2xl bg-surface px-4 shadow-row">
            <TokenIcon token={tokenIn} />
            <div className="flex flex-col">
              <span className="font-semibold leading-tight">{LABELS[tokenIn]}</span>
              <span className="tabular text-[11px] font-semibold text-ink-muted">
                Balance: {formatToken(available, decimals)}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-end gap-1">
              <div className="flex gap-1">
                {SHORTCUTS.map((percent) => (
                  <button
                    key={percent.toString()}
                    type="button"
                    className={CHIP}
                    disabled={available === 0n}
                    onClick={() => setInput(formatUnits((available * percent) / 100n, decimals))}
                  >
                    {percent === 100n ? "MAX" : `${percent}%`}
                  </button>
                ))}
              </div>
              <input
                aria-label={`Amount in ${LABELS[tokenIn]}`}
                aria-invalid={error ? true : undefined}
                inputMode="decimal"
                placeholder="0"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="tabular w-full bg-transparent text-right text-xl font-bold text-ink placeholder:text-border focus:outline-none"
              />
            </div>
          </div>

          <button
            type="button"
            aria-label={`Switch to ${isBuy ? "selling" : "buying"} ${LABELS[base]}`}
            onClick={() => {
              setSide(isBuy ? "Sell" : "Buy");
              setInput("");
            }}
            className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Icon name="swap" size={16} />
          </button>

          <ReceiveRow token={tokenOut} amount={settled.ok ? quote.data?.quotedOut : undefined} />
        </div>
        {error ? (
          <p role="alert" className="text-[13px] leading-5 text-down">
            {error}
          </p>
        ) : null}

        <InfoCard book={book.data} quote={settled.ok ? quote.data : null} />

        <Button type="submit" pending={pending} disabled={!canFill || tooMuchImpact}>
          {side} {LABELS[base]}
        </Button>
        {done ? (
          <p role="status" className="animate-enter text-center text-sm font-semibold text-up">
            {done}
          </p>
        ) : null}
      </form>
    </section>
  );
}
