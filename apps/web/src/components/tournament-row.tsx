import type { Phase } from "@yotrade/plugin-tournament/phase";
import Link from "next/link";

import { formatUsdc, timeLeft, tournamentName } from "@/lib/format.ts";
import type { IndexedTournament } from "@/lib/indexer.ts";
import { PhaseBadge } from "./phase-badge.tsx";
import { Icon } from "./ui/icon.tsx";

interface Props {
  readonly tournament: IndexedTournament;
  readonly phase: Phase;
  readonly now: bigint;
}

/** Kit asset row: 40 px icon, name over a muted line, value over a status on the right. */
export function TournamentRow({ tournament, phase, now }: Props) {
  // Short on purpose: the row also carries the trader count. "6d 3h" reads as time left.
  const left = timeLeft(phase, tournament, now);
  const schedule = left && phase === "upcoming" ? `in ${left}` : left;
  return (
    <Link
      href={`/t/${tournament.id}`}
      className="flex items-center gap-4 rounded-2xl bg-surface-raised p-4 transition duration-200 hover:bg-well focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.99]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent">
        <Icon name="crown" size={20} className="brightness-0 invert" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate font-semibold leading-[21px]">
          {tournamentName(tournament.id, tournament.metadataURI)}
        </p>
        <p className="tabular truncate text-sm font-medium leading-5 text-ink-muted">
          {tournament.participantCount}/{tournament.maxParticipants} traders
          {schedule ? ` · ${schedule}` : ""}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <p className="tabular font-semibold leading-[21px]">${formatUsdc(tournament.prizePool)}</p>
        <PhaseBadge phase={phase} />
      </div>
    </Link>
  );
}
