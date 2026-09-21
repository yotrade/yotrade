import Link from "next/link";

import { countdown, formatUsdc, tournamentName } from "@/lib/format.ts";
import { formatBps, roiBps } from "@/lib/ticket.ts";
import type { MyTournament } from "@/lib/use-my-tournaments.ts";
import { Icon } from "./ui/icon.tsx";

/** Monad's palette as card faces, with a text colour that keeps AA contrast on each. */
const FACES = [
  "bg-[#6e54ff] text-white",
  "bg-[#0e091c] text-white",
  "bg-[#ffae45] text-[#0e091c]",
  "bg-[#85e6ff] text-[#0e091c]",
  "bg-[#ff8ee4] text-[#0e091c]",
] as const;

/** The kit's coloured wallet card, one per tournament account: name, value, return, time left. */
export function EntryCard({ item, now }: { item: MyTournament; now: bigint }) {
  const { tournament, entry, phase, value } = item;
  const face = FACES[Number(tournament.id % BigInt(FACES.length))];
  const roi = value === null ? null : roiBps(value, entry.capitalAtJoin);
  const status =
    countdown(phase, tournament, now) || (entry.rank ? `Finished #${entry.rank}` : "Finished");

  return (
    <Link
      href={`/t/${tournament.id}`}
      className={`flex h-[168px] w-[150px] shrink-0 snap-start flex-col justify-between rounded-3xl p-4 shadow-button transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] ${face}`}
    >
      <div className="flex items-start justify-between">
        <span className="grid size-9 place-items-center rounded-full bg-white/25">
          <Icon name="credit-card" size={18} className="brightness-0 invert" />
        </span>
        <span className="rounded-lg bg-white/25 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">
          {phase === "live" ? "Live" : phase}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="truncate text-sm font-semibold opacity-90">
          {tournamentName(tournament.id, tournament.metadataURI)}
        </p>
        <p className="tabular text-xl font-bold leading-6 tracking-tight">
          ${formatUsdc(value ?? entry.capitalAtJoin)}
        </p>
        <p className="tabular truncate text-xs font-semibold opacity-80">
          {roi === null ? status : `${formatBps(roi)} · ${status}`}
        </p>
      </div>
    </Link>
  );
}
