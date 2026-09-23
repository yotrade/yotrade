"use client";

import type { Address } from "viem";

import type { IndexedTournamentDetail } from "@/lib/indexer.ts";
import { clock } from "@/lib/screen.ts";
import { traderName, useProfiles } from "@/lib/use-profiles.ts";
import { Avatar } from "./ui/avatar.tsx";

/** Before the bell: a countdown and everyone who is in, each name popping in as they join. */
export function LobbyList({
  tournament,
  now,
  you,
}: {
  tournament: IndexedTournamentDetail;
  now: bigint;
  you: Address | undefined;
}) {
  const people = tournament.entries.map((entry) => entry.participant_id as Address);
  const profileOf = useProfiles(people);
  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-surface-raised p-5" aria-live="polite">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <p className="text-[13px] font-semibold text-ink-muted">Starts in</p>
          <p className="tabular font-mono text-[40px] font-bold leading-none tracking-tight">
            {clock(tournament.startTime - now)}
          </p>
        </div>
        <p className="tabular text-right text-sm font-semibold text-ink-muted">
          <span className="text-2xl font-bold text-ink">{people.length}</span>/
          {tournament.maxParticipants} in
        </p>
      </div>
      {people.length === 0 ? (
        <p className="text-sm font-medium text-ink-muted">
          Nobody yet. Share the game code to fill the room.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {people.map((person) => (
            <li
              key={person}
              className={`flex animate-pop items-center gap-2 rounded-full py-1 pl-1 pr-3 ${person === you ? "bg-accent text-accent-ink" : "bg-surface"}`}
            >
              <Avatar address={person} size={28} avatar={profileOf(person)?.avatar} />
              <span className="max-w-32 truncate text-sm font-semibold">
                {traderName(person, profileOf(person), person === you)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
