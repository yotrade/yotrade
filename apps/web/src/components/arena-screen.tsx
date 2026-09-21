"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { indexer } from "@/lib/indexer-client.ts";
import { TournamentBrowser } from "./tournament-browser.tsx";
import { Icon } from "./ui/icon.tsx";

export function ArenaScreen() {
  const tournaments = useQuery({
    queryKey: ["tournaments"],
    queryFn: () => indexer.tournaments(),
    refetchInterval: 5_000,
  });
  return (
    <main className="flex flex-1 flex-col gap-6 pb-28 pt-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold leading-[26px] tracking-tight">Arena</h1>
        <Link
          href="/new"
          className="flex min-h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 font-mono text-[13px] font-semibold text-accent-ink shadow-button transition duration-200 hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]"
        >
          <Icon name="plus" size={14} className="brightness-0 invert" />
          Host
        </Link>
      </header>
      <TournamentBrowser tournaments={tournaments.data} failed={tournaments.isError} />
    </main>
  );
}
