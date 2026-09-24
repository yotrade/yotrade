import { formatUsdc } from "./format.ts";
import { formatBps } from "./ticket.ts";

export interface Result {
  /** One-based. */
  readonly rank: number;
  readonly of: number;
  readonly roiPpm: number;
  /** Raw USDC won; zero when the place carried no prize or the tournament had none. */
  readonly prize: bigint;
}

/** What a shared result says: the place, the headline line under it, and the facts on the card. */
export function resultCard(result: Result) {
  const podium = result.rank <= 3;
  const facts: [string, string][] = [
    ["Return", formatBps(result.roiPpm / 100)],
    ["Traders", result.of.toString()],
  ];
  if (result.prize > 0n) {
    facts.push(["Won", `$${formatUsdc(result.prize)}`]);
  }
  return {
    place: `#${result.rank}`,
    line: podium ? "On the podium" : `Finished #${result.rank} of ${result.of}`,
    facts,
  };
}
