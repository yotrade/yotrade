import { parseUnits } from "viem";

export type TicketResult =
  | { readonly ok: true; readonly amount: bigint }
  | { readonly ok: false; readonly reason: string };

/** Turns what the trader typed into token units, or says why it cannot be traded. */
export function parseTicket(input: string, decimals: number, available: bigint): TicketResult {
  const text = input.trim();
  if (!/^\d*\.?\d*$/.test(text) || text === "" || text === ".") {
    return { ok: false, reason: "Enter an amount" };
  }
  if ((text.split(".")[1]?.length ?? 0) > decimals) {
    return { ok: false, reason: `At most ${decimals} decimals` };
  }
  const amount = parseUnits(text, decimals);
  if (amount === 0n) {
    return { ok: false, reason: "Enter an amount" };
  }
  if (amount > available) {
    return { ok: false, reason: "More than you have available" };
  }
  return { ok: true, amount };
}

/** ROI in basis points, rounded toward zero. `null` when there is no capital to compare against. */
export function roiBps(value: bigint, capital: bigint): number | null {
  return capital === 0n ? null : Number(((value - capital) * 10_000n) / capital);
}

export function formatBps(bps: number): string {
  return `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(2)}%`;
}
