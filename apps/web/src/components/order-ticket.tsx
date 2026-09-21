"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type MarketSymbol, markets, type TokenSymbol, tokens } from "@yotrade/core/addresses";
import { EmptyBookError, PriceImpactError } from "@yotrade/plugin-kuru/errors";
import { DEFAULT_MAX_IMPACT_BPS, type SwapQuote } from "@yotrade/plugin-kuru/plugin";
import { type Book, midPrice } from "@yotrade/plugin-kuru/pricing";
import type { MeraWallet } from "@yotrade/plugin-mera/plugin";
import { type FormEvent, useState } from "react";

import { formatToken, formatUsdc } from "@/lib/format.ts";
import { fundGas, GasError } from "@/lib/fund-gas.ts";
import {
  NETWORK_FEE_MON,
  type OrderDetails,
  orderDetails,
  SLIPPAGE_BPS,
} from "@/lib/order-details.ts";
import { parseTicket, shortcutAmount } from "@/lib/ticket.ts";
import { TOKEN_LABELS } from "@/lib/tokens.ts";
import { useDebounced } from "@/lib/use-debounced.ts";
import { useRuntime } from "@/lib/use-runtime.ts";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Icon } from "./ui/icon.tsx";
import { TokenIcon } from "./ui/token-icon.tsx";

const SHORTCUTS = [25n, 50n, 100n] as const;

export type Side = "Buy" | "Sell";

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
  if (cause instanceof GasError) {
    return cause.message;
  }
  if (cause instanceof EmptyBookError) {
    return "This market has no liquidity right now.";
  }
  if (cause instanceof PriceImpactError) {
    return "The book is too thin for this size. Nothing was traded. Try a smaller amount.";
  }
  return "The order did not go through. Nothing was traded.";
}

interface InfoProps {
  readonly book: Book | undefined;
  readonly quote: SwapQuote | null | undefined;
  readonly details: OrderDetails | null;
  readonly base: TokenSymbol;
  readonly tokenOut: TokenSymbol;
  readonly takerFeeBps: number | undefined;
}

const price = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: value < 10 ? 6 : 2 });

/** Everything a venue tells you before you confirm. Rows read "—" until there is an amount to quote. */
function InfoCard({ book, quote, details, base, tokenOut, takerFeeBps }: InfoProps) {
  const tooMuch = (quote?.impactBps ?? 0) > DEFAULT_MAX_IMPACT_BPS;
  const rows: { label: string; value: string; alert?: boolean }[] = [
    { label: "Order type", value: "Market" },
    { label: "Market", value: bookLine(book) },
    {
      label: "Rate",
      value: details ? `1 ${TOKEN_LABELS[base]} = ${price(details.rate)} USDC` : "—",
    },
    {
      label: "Price impact",
      value: quote ? `${(quote.impactBps / 100).toFixed(2)}%` : "—",
      alert: tooMuch,
    },
    { label: "Slippage tolerance", value: `${(SLIPPAGE_BPS / 100).toFixed(2)}%` },
    {
      label: "Minimum received",
      value: details
        ? `${formatToken(details.minimumReceived, tokens[tokenOut].decimals)} ${TOKEN_LABELS[tokenOut]}`
        : "—",
    },
    {
      label: "Trading fee",
      value: takerFeeBps === undefined ? "—" : `${(takerFeeBps / 100).toFixed(2)}% · included`,
    },
    { label: "Network fee", value: `≈ ${NETWORK_FEE_MON} MON` },
  ];
  return (
    <Card className="flex flex-col gap-2" aria-live="polite">
      <dl className="flex flex-col gap-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 text-sm font-medium"
          >
            <dt className="text-ink-muted">{row.label}</dt>
            <dd className={`tabular text-right ${row.alert ? "font-bold text-down" : ""}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
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
        <span className="font-semibold leading-tight">{TOKEN_LABELS[token]}</span>
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

/** Long amounts step the digits down instead of clipping them. */
const amountClass = (text: string) => (text.length > 9 ? "text-base" : "text-xl");

interface UnavailableProps {
  readonly book: Book | undefined;
  readonly isBuy: boolean;
  readonly base: TokenSymbol;
  onSwitch(): void;
}

/** A one-sided book: say which side is missing and offer the one that works, instead of a dead button. */
function SideUnavailable({ book, isBuy, base, onSwitch }: UnavailableProps) {
  if (!book || (isBuy ? book.hasAsk : book.hasBid)) {
    return null;
  }
  const otherSideWorks = isBuy ? book.hasBid : book.hasAsk;
  return (
    <div role="status" className="flex flex-col gap-2 rounded-2xl bg-down/10 p-4">
      <p className="text-sm font-semibold text-down">
        Nobody is {isBuy ? "selling" : "buying"} {TOKEN_LABELS[base]} on Kuru right now.
      </p>
      {otherSideWorks ? (
        <button
          type="button"
          onClick={onSwitch}
          className="w-fit rounded-full bg-surface px-3 py-1.5 font-mono text-xs font-bold shadow-row focus-visible:outline-2 focus-visible:outline-accent"
        >
          {isBuy ? "Sell" : "Buy"} instead
        </button>
      ) : null}
    </div>
  );
}

interface Props {
  readonly wallet: MeraWallet;
  readonly market: MarketSymbol;
  readonly side: Side;
  onSideChange(next: Side): void;
  /** Called after a fill, with a sentence describing it. */
  onDone(message: string): void;
}

/** The kit's exchange field as an order ticket: pay row, flip button, receive row, the numbers, one button. */
export function OrderTicket({ wallet, market, side, onSideChange, onDone }: Props) {
  const { kuru, publicClient } = useRuntime();
  const queryClient = useQueryClient();
  const address = wallet.account.address;
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

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

  const info = useQuery({
    queryKey: ["market-info", markets[market].orderBook],
    queryFn: () => kuru.data.market(markets[market].orderBook),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const base = markets[market].base;
  const isBuy = side === "Buy";
  const tokenIn: TokenSymbol = isBuy ? "usdc" : base;
  const tokenOut: TokenSymbol = isBuy ? base : "usdc";
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
    const ticket = parseTicket(input, decimals, available);
    if (!ticket.ok) {
      setError(ticket.reason);
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      // Traders run out of gas mid-tournament, not at the door: top up before the order, not only at join.
      await fundGas(publicClient, address);
      await kuru.market.swap(wallet, {
        market,
        side: isBuy ? "buy" : "sell",
        amountIn: ticket.amount,
        slippageBps: SLIPPAGE_BPS,
      });
      const message = isBuy
        ? `Bought ${TOKEN_LABELS[base]} for ${input} USDC`
        : `Sold ${input} ${TOKEN_LABELS[base]}`;
      setInput("");
      await queryClient.invalidateQueries({ queryKey: ["portfolio", address] });
      onDone(message);
    } catch (cause) {
      console.error("swap failed", cause);
      setError(failureCopy(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <SideUnavailable
        book={book.data}
        isBuy={isBuy}
        base={base}
        onSwitch={() => onSideChange(isBuy ? "Sell" : "Buy")}
      />
      {/* Kit exchange field: a grey well holding two white rows, with the flip button on the seam. */}
      <div className="relative flex flex-col gap-1 rounded-[18px] bg-well p-1">
        <div className="flex min-h-[72px] items-center gap-2 rounded-2xl bg-surface px-4 shadow-row">
          <TokenIcon token={tokenIn} />
          <div className="flex shrink-0 flex-col">
            <span className="font-semibold leading-tight">{TOKEN_LABELS[tokenIn]}</span>
            <span className="tabular whitespace-nowrap text-[11px] font-semibold text-ink-muted">
              Balance:{" "}
              {tokenIn === "usdc" ? formatUsdc(available) : formatToken(available, decimals)}
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
                  onClick={() =>
                    setInput(shortcutAmount(available, percent, decimals, tokenIn === "usdc"))
                  }
                >
                  {percent === 100n ? "MAX" : `${percent}%`}
                </button>
              ))}
            </div>
            <input
              aria-label={`Amount in ${TOKEN_LABELS[tokenIn]}`}
              aria-invalid={error ? true : undefined}
              inputMode="decimal"
              placeholder="0"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className={`tabular w-full min-w-0 bg-transparent text-right font-bold text-ink placeholder:text-border focus:outline-none ${amountClass(input)}`}
            />
          </div>
        </div>

        <button
          type="button"
          aria-label={`Switch to ${isBuy ? "selling" : "buying"} ${TOKEN_LABELS[base]}`}
          onClick={() => {
            onSideChange(isBuy ? "Sell" : "Buy");
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

      <InfoCard
        book={book.data}
        quote={settled.ok ? quote.data : null}
        details={
          settled.ok && quote.data
            ? orderDetails(
                isBuy,
                settled.amount,
                quote.data.quotedOut,
                decimals,
                tokens[tokenOut].decimals,
              )
            : null
        }
        base={base}
        tokenOut={tokenOut}
        takerFeeBps={info.data?.takerFeeBps}
      />

      <Button type="submit" pending={pending} disabled={!canFill || tooMuchImpact}>
        {side} {TOKEN_LABELS[base]}
      </Button>
    </form>
  );
}
