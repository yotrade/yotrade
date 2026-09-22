import { formatUsdc, timeLeft } from "./format.ts";
import { formatBps, roiBps } from "./ticket.ts";
import type { MyTournament } from "./use-my-tournaments.ts";

export interface EntrySummary {
  /** One big fact: my return, my rank, or what I won. */
  readonly headline: string;
  /** One line of status under it. */
  readonly line: string;
}

function running({ tournament, entry, phase, value }: MyTournament, now: bigint): EntrySummary {
  const left = timeLeft(phase, tournament, now);
  if (phase === "upcoming") {
    return { headline: "—", line: left ? `Starts in ${left}` : "Starting" };
  }
  const roi = value === null ? null : roiBps(value, entry.capitalAtJoin);
  return { headline: roi === null ? "—" : formatBps(roi), line: left ? `Live · ${left} left` : "Live" };
}

function ended({ entry, phase }: MyTournament): EntrySummary {
  // Ended, nobody named yet: the outcome is not known, so it is not "no prize".
  if (phase === "scoring") {
    return { headline: "Ended", line: "Waiting for results" };
  }
  const review = phase === "dispute";
  if (entry.prize > 0n) {
    let line = "Claim your prize";
    if (entry.claimed) {
      line = "Claimed";
    } else if (review) {
      line = "Results in review";
    }
    return { headline: `Won $${formatUsdc(entry.prize)}`, line };
  }
  if (entry.rank) {
    return { headline: `#${entry.rank}`, line: review ? "Results in review" : "Finished" };
  }
  return { headline: review ? "—" : "Finished", line: review ? "Results in review" : "No prize" };
}

/** What a card says about one of my tournaments, in the tournament's current phase. */
export function summarize(item: MyTournament, now: bigint): EntrySummary {
  return item.phase === "upcoming" || item.phase === "live" ? running(item, now) : ended(item);
}
