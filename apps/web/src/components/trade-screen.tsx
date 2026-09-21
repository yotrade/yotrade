"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { useIdentity } from "@/lib/use-identity.tsx";
import { useRuntime } from "@/lib/use-runtime.ts";
import { TradePanel } from "./trade-panel.tsx";
import { Icon } from "./ui/icon.tsx";

/** The kit's swap screen: a title, a close button, and nothing but the ticket. */
export function TradeScreen({ id }: { id: string }) {
  const { tournament } = useRuntime();
  const { identity } = useIdentity();
  const wallet = identity?.tournamentWallet(BigInt(id));
  const address = wallet?.account.address;
  const entry = useQuery({
    queryKey: ["entry", id, address],
    queryFn: () => (address ? tournament.entry(BigInt(id), address) : null),
    enabled: address !== undefined,
  });

  return (
    <main className="flex flex-1 flex-col gap-6 pb-10 pt-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold leading-[26px] tracking-tight">Trade</h1>
        <Link
          href={`/t/${id}`}
          aria-label="Close"
          className="grid size-10 place-items-center rounded-full transition duration-200 hover:bg-well focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Icon name="close" />
        </Link>
      </header>
      {wallet && entry.data ? (
        <TradePanel wallet={wallet} capitalAtJoin={entry.data.capitalAtJoin} />
      ) : (
        <p className="text-sm font-medium text-ink-muted">
          {entry.isPending ? "Loading your account…" : "Join this tournament to trade in it."}
        </p>
      )}
    </main>
  );
}
