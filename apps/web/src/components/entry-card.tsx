import Image from "next/image";
import Link from "next/link";

import { formatUsdc, timeLeft, tournamentMeta } from "@/lib/format.ts";
import { formatBps, roiBps } from "@/lib/ticket.ts";
import type { MyTournament } from "@/lib/use-my-tournaments.ts";
import { venueOf } from "@/lib/venue.ts";
import { TournamentLogo } from "./ui/tournament-logo.tsx";

/** Monad's palette as card faces, with a text colour that keeps AA contrast on each. */
const FACES = [
  "bg-[#6e54ff] text-white",
  "bg-[#0e091c] text-white",
  "bg-[#ffae45] text-[#0e091c]",
  "bg-[#85e6ff] text-[#0e091c]",
  "bg-[#ff8ee4] text-[#0e091c]",
] as const;

/** One big fact and one small line: how I am doing, and where the tournament stands. */
function summary(item: MyTournament, now: bigint): { headline: string; line: string } {
  const { tournament, entry, phase, value } = item;
  const left = timeLeft(phase, tournament, now);
  if (phase === "upcoming") {
    return { headline: "—", line: left ? `Starts in ${left}` : "Starting" };
  }
  if (phase === "live") {
    const roi = value === null ? null : roiBps(value, entry.capitalAtJoin);
    return {
      headline: roi === null ? "—" : formatBps(roi),
      line: left ? `Live · ${left} left` : "Live",
    };
  }
  if (entry.prize > 0n) {
    return {
      headline: `Won $${formatUsdc(entry.prize)}`,
      line: entry.claimed ? "Claimed" : "Claim your prize",
    };
  }
  return {
    headline: entry.rank ? `#${entry.rank}` : "Finished",
    line: entry.rank ? "Finished" : "No prize",
  };
}

function VenueMark({ futures }: { futures: boolean }) {
  if (futures) {
    return (
      <span
        role="img"
        aria-label="Futures"
        className="grid size-6 shrink-0 place-items-center rounded-full bg-white/30 font-mono text-[11px] font-bold"
      >
        ⇅
      </span>
    );
  }
  return (
    <Image
      src="/brands/kuru.png"
      alt="Spot on Kuru"
      width={24}
      height={24}
      className="shrink-0 rounded-full"
    />
  );
}

/** The kit's coloured wallet card, one per tournament account. */
export function EntryCard({ item, now }: { item: MyTournament; now: bigint }) {
  const { tournament } = item;
  const face = FACES[Number(tournament.id % BigInt(FACES.length))];
  const futures = venueOf(tournament.venue) === "futures";
  const { headline, line } = summary(item, now);
  const meta = tournamentMeta(tournament.id, tournament.metadataURI);

  return (
    <Link
      href={`/t/${tournament.id}`}
      className={`flex h-[164px] w-[160px] shrink-0 snap-start flex-col justify-between rounded-3xl p-4 shadow-button transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] ${face}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-semibold leading-[18px]">{meta.name}</p>
        {meta.image ? (
          <TournamentLogo image={meta.image} size={28} />
        ) : (
          <VenueMark futures={futures} />
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="tabular truncate text-[26px] font-bold leading-8 tracking-tight">
          {headline}
        </p>
        <p className="truncate text-xs font-semibold opacity-80">{line}</p>
      </div>
    </Link>
  );
}
