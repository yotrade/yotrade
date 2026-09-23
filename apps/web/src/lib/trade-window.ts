import type { Phase } from "@yotrade/plugin-tournament/phase";

/**
 * What the trade bar says instead of its buttons. Null while trading is open. The contract refuses futures
 * orders outside the window and spot fills outside it are never scored, so the bar must not offer them.
 */
export function tradeGate(phase: Phase, opensIn: string): string | null {
  switch (phase) {
    case "live":
      return null;
    case "upcoming":
      return opensIn ? `Trading opens in ${opensIn}` : "Trading opens at the start";
    case "cancelled":
      return "This tournament was called off";
    case "unknown":
      return null;
    default:
      return "Trading has ended. The results are being scored";
  }
}
