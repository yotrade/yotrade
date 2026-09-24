import { formatUnits, parseUnits } from "viem";

import { tokens, yotrade } from "@yotrade/core/addresses";
import type { TournamentConfig } from "@yotrade/plugin-tournament/plugin";

import { tournamentMeta } from "./format.ts";
import { isLogoUrl } from "./logo-url.ts";
import { type Venue, venueOf } from "./venue.ts";

export const SPLITS = {
  "Winner takes all": [10_000],
  "Top 3": [5_000, 3_000, 2_000],
  "Top 5": [4_000, 2_500, 1_500, 1_000, 1_000],
} as const;
export type SplitName = keyof typeof SPLITS;

export const START_DELAYS = { "In 2 minutes": 120, "In 10 minutes": 600, "In 1 hour": 3_600, Tomorrow: 86_400 } as const;
export const DURATIONS = { "5 minutes": 300, "1 hour": 3_600, "1 day": 86_400, "3 days": 259_200, "7 days": 604_800 } as const;

/** Enforced onchain at join, and exactly what the join flow deposits from the faucet claim. */
const STARTING_CAPITAL = parseUnits("1000", tokens.usdc.decimals);
/** One Kuru faucet claim: what a fresh organizer account can escrow without outside funds. */
const MAX_POOL = parseUnits("10000", tokens.usdc.decimals);
const MAX_METADATA_BYTES = 512;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_ROOT = `0x${"0".repeat(64)}` as const;

export interface CreateForm {
  readonly venue: Venue;
  readonly visibility: "public" | "private";
  /** Optional https link to the host's logo. */
  readonly image: string;
  readonly name: string;
  readonly prizePool: string;
  readonly startDelay: keyof typeof START_DELAYS;
  readonly duration: keyof typeof DURATIONS;
  readonly maxParticipants: string;
  readonly split: SplitName;
}

export type BuildResult =
  | { readonly ok: true; readonly config: TournamentConfig }
  | { readonly ok: false; readonly field: keyof CreateForm; readonly reason: string };

export type MetadataResult =
  | { readonly ok: true; readonly metadataURI: string }
  | { readonly ok: false; readonly field: "name" | "image"; readonly reason: string };

/** What the app stores about a tournament, as the data URI the contract keeps. Same rules at create and edit. */
export function buildMetadata(form: Pick<CreateForm, "name" | "visibility" | "image">): MetadataResult {
  const name = form.name.trim();
  const image = form.image.trim();
  if (name === "") {
    return { ok: false, field: "name", reason: "Give your tournament a name" };
  }
  if (image !== "" && !isLogoUrl(image)) {
    return { ok: false, field: "image", reason: "Paste an https link to an image" };
  }
  const metadata = {
    name,
    ...(form.visibility === "private" ? { visibility: "private" } : {}),
    ...(image === "" ? {} : { image }),
  };
  const metadataURI = `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;
  if (new TextEncoder().encode(metadataURI).length > MAX_METADATA_BYTES) {
    return { ok: false, field: image === "" ? "name" : "image", reason: "That is too long to store" };
  }
  return { ok: true, metadataURI };
}

/** Form → contract `Config`. Rejects here what the contract would reject after the organizer paid for gas. */
export function buildConfig(form: CreateForm, nowSeconds: bigint): BuildResult {
  const metadata = buildMetadata(form);
  if (!metadata.ok) {
    return metadata;
  }
  const { metadataURI } = metadata;
  if (!/^\d+(\.\d{1,6})?$/.test(form.prizePool.trim())) {
    return { ok: false, field: "prizePool", reason: "Enter an amount in USDC, or 0" };
  }
  const prizePool = parseUnits(form.prizePool.trim(), tokens.usdc.decimals);
  if (prizePool > MAX_POOL) {
    return { ok: false, field: "prizePool", reason: "Test funds cover up to 10,000 USDC" };
  }
  const maxParticipants = Number(form.maxParticipants);
  if (!Number.isInteger(maxParticipants) || maxParticipants < 2 || maxParticipants > 1_000) {
    return { ok: false, field: "maxParticipants", reason: "Between 2 and 1,000 traders" };
  }

  const startTime = nowSeconds + BigInt(START_DELAYS[form.startDelay]);
  // Futures capital is virtual and the same for everyone, so there is no token and nothing to require.
  const capital =
    form.venue === "futures"
      ? { capitalToken: ZERO_ADDRESS, venue: yotrade.perpsVenueAdapter, startingCapital: 0n }
      : {
          capitalToken: tokens.usdc.address,
          venue: yotrade.kuruVenueAdapter,
          startingCapital: STARTING_CAPITAL,
        };
  return {
    ok: true,
    config: {
      prizeToken: tokens.usdc.address,
      ...capital,
      prizePool,
      startTime,
      endTime: startTime + BigInt(DURATIONS[form.duration]),
      maxParticipants,
      allowlistRoot: ZERO_ROOT,
      prizeSplitBps: SPLITS[form.split],
      metadataURI,
    },
  };
}

/** What a rematch needs to know about the tournament it repeats. */
export interface Played {
  readonly id: bigint;
  readonly venue: string;
  readonly metadataURI: string;
  readonly prizePool: bigint;
  readonly prizeSplitBps: readonly number[];
  readonly startTime: bigint;
  readonly endTime: bigint;
  readonly maxParticipants: number;
}

/** "Game Night" becomes "Game Night #2", "Game Night #2" becomes "Game Night #3". */
export function nextName(name: string): string {
  const numbered = /^(.*) #(\d+)$/.exec(name);
  return numbered ? `${numbered[1]} #${Number(numbered[2]) + 1}` : `${name} #2`;
}

/**
 * The create form filled in from a tournament that was played: same market, visibility, logo, pool, split,
 * length and size, the next number in the name, starting in ten minutes. A community's weekly game is one tap.
 */
export function rematchForm(played: Played): CreateForm {
  const meta = tournamentMeta(played.id, played.metadataURI);
  const length = Number(played.endTime - played.startTime);
  const duration = (Object.keys(DURATIONS) as (keyof typeof DURATIONS)[]).reduce((best, key) =>
    Math.abs(DURATIONS[key] - length) < Math.abs(DURATIONS[best] - length) ? key : best,
  );
  const split = (Object.keys(SPLITS) as SplitName[]).find(
    (key) => SPLITS[key].join() === played.prizeSplitBps.join(),
  );
  return {
    venue: venueOf(played.venue),
    visibility: meta.visibility,
    image: meta.image ?? "",
    name: nextName(meta.name),
    prizePool: formatUnits(played.prizePool, tokens.usdc.decimals),
    startDelay: "In 10 minutes",
    duration,
    maxParticipants: played.maxParticipants.toString(),
    split: split ?? "Top 3",
  };
}
