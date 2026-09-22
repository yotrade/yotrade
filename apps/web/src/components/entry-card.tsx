import Image from "next/image";
import Link from "next/link";

import { formatUsdc, timeLeft, tournamentName } from "@/lib/format.ts";
import { formatBps, roiBps } from "@/lib/ticket.ts";
import type { MyTournament } from "@/lib/use-my-tournaments.ts";
import { venueOf } from "@/lib/venue.ts";

/** Monad's palette as card faces, with a text colour that keeps AA contrast on each. */
const FACES = [
  "bg-[#6e54ff] text-white",
  "bg-[#0e091c] text-white",
  "bg-[#ffae45] text-[#0e091c]",
  "bg-[#85e6ff] text-[#0e091c]",
  "bg-[#ff8ee4] text-[#0e091c]",
] as const;

/** What the card says under the value: where it stands, then when it ends. */
function footer(item: MyTournament, roi: number | null, now: bigint): string {
  const { tournament, entry, phase } = item;
  // The card is narrow: "55m 18s" reads as time left without the word.
  const clock = timeLeft(phase, tournament, now);
  if (clock) {
    const when = phase === "upcoming" ? `Starts in ${clock}` : clock;
    return roi === null ? when : `${formatBps(roi)} · ${when}`;
  }
  if (entry.prize > 0n) {
    return `Won $${formatUsdc(entry.prize)}${entry.claimed ? " · claimed" : ""}`;
  }
  return entry.rank ? `Finished #${entry.rank}` : "Finished";
}

/** The kit's coloured wallet card, one per tournament account: venue, name, value, return, time left. */
export function EntryCard({ item, now }: { item: MyTournament; now: bigint }) {
  const { tournament, entry, phase, value } = item;
  const face = FACES[Number(tournament.id % BigInt(FACES.length))];
  const roi = value === null ? null : roiBps(value, entry.capitalAtJoin);
  const futures = venueOf(tournament.venue) === "futures";

  return (
    <Link
      href={`/t/${tournament.id}`}
      className={`flex h-[172px] w-[160px] shrink-0 snap-start flex-col justify-between rounded-3xl p-4 shadow-button transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] ${face}`}
    >
      <div className="flex items-start justify-between">
        <span className="flex items-center gap-1.5 rounded-full bg-white/25 py-1 pl-1 pr-2 font-mono text-[10px] font-bold uppercase">
          {futures ? (
            <span className="grid size-4 place-items-center rounded-full bg-white/80 text-[9px] text-[#0e091c]">
              ⇅
            </span>
          ) : (
            <Image src="/brands/kuru.png" alt="" width={16} height={16} className="rounded-full" />
          )}
          {futures ? "Futures" : "Spot"}
        </span>
        <span className="rounded-lg bg-white/25 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">
          {phase === "live" ? "Live" : phase}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="line-clamp-2 text-sm font-semibold leading-[18px] opacity-90">
          {tournamentName(tournament.id, tournament.metadataURI)}
        </p>
        <p className="tabular text-xl font-bold leading-6 tracking-tight">
          ${formatUsdc(value ?? entry.capitalAtJoin)}
        </p>
        <p className="tabular truncate text-xs font-semibold opacity-80">
          {footer(item, roi, now)}
        </p>
      </div>
    </Link>
  );
}
