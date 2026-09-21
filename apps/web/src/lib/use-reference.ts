"use client";

import { useQuery } from "@tanstack/react-query";

import type { Bar, RangeName } from "./chart.ts";
import type { MarketSlug } from "./markets.ts";

export interface ReferenceSeries {
  readonly label: string;
  readonly from: number;
  readonly to: number;
  readonly bars: Bar[];
}

/** Real-world price history for the asset behind a market, from `/api/reference`. A reference, not a quote. */
export function useReference(slug: MarketSlug, range: RangeName, enabled = true) {
  return useQuery({
    queryKey: ["reference", slug, range],
    enabled,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ReferenceSeries> => {
      const response = await fetch(`/api/reference/${slug}?range=${range}`);
      if (!response.ok) {
        throw new Error(`Reference answered ${response.status}`);
      }
      return (await response.json()) as ReferenceSeries;
    },
  });
}
