import { type Held, risk, roiPpm, STARTING_BALANCE } from "@yotrade/plugin-perps/math";
import type { PerpsAccount } from "@yotrade/plugin-perps/plugin";
import type { Hex } from "viem";

import { toUsdc } from "@/lib/perps-markets.ts";
import type { Scored } from "./scoring.ts";

/**
 * A futures score is the account's equity against the virtual start. `prices` are live while the tournament
 * runs and the prices at its end afterwards, which is exactly what `settle` will realize onchain.
 */
export function scorePerps(
  entry: Pick<Scored, "participant" | "tradingAccount" | "joinedAt" | "capitalAtJoin">,
  account: PerpsAccount,
  prices: Readonly<Record<Hex, bigint>>,
): Scored {
  const held: Held[] = account.positions.map((position) => {
    const price = prices[position.market.toLowerCase() as Hex];
    if (price === undefined) {
      throw new Error(`No price for ${position.market}`);
    }
    return { ...position, price };
  });
  const equity = risk(account.balance, held).equity;
  const floored = equity < 0n ? 0n : equity;
  return {
    ...entry,
    pnl: toUsdc(floored - STARTING_BALANCE),
    roiPpm: roiPpm(equity),
    // Every fill pays a fee, so an account that still holds exactly the start never traded.
    fills: account.balance === STARTING_BALANCE && account.positions.length === 0 ? 0 : 1,
  };
}
