import { yotrade } from "@yotrade/core/addresses";

export type Venue = "spot" | "futures";

/** A tournament trades on exactly one venue, fixed at creation by the adapter in its config. */
export function venueOf(adapter: string): Venue {
  return adapter.toLowerCase() === yotrade.perpsVenueAdapter.toLowerCase() ? "futures" : "spot";
}

export const VENUE_LABELS: Record<Venue, string> = { spot: "Spot · Kuru", futures: "Futures · Pyth" };
