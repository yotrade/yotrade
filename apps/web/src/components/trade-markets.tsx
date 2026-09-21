"use client";

import { useQuery } from "@tanstack/react-query";

import { indexer } from "@/lib/indexer-client.ts";
import { venueOf } from "@/lib/venue.ts";
import { MarketList } from "./market-list.tsx";
import { PerpsMarketList } from "./perps-market-list.tsx";
import { BackButton } from "./ui/back-button.tsx";
import { RowsSkeleton } from "./ui/skeleton.tsx";

/** The market list of whichever venue the tournament trades on. */
export function TradeMarkets({ id }: { id: string }) {
  const { data, isError } = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => indexer.tournament(BigInt(id)),
  });
  if (data) {
    return venueOf(data.venue) === "futures" ? <PerpsMarketList id={id} /> : <MarketList id={id} />;
  }
  return (
    <main className="flex flex-1 flex-col gap-6 pb-10 pt-4">
      <header className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-xl font-bold leading-[26px] tracking-tight">Markets</h1>
      </header>
      {isError || data === null ? (
        <p role="alert" className="text-sm font-medium text-down">
          This tournament could not be loaded.
        </p>
      ) : (
        <RowsSkeleton label="Loading markets" />
      )}
    </main>
  );
}
