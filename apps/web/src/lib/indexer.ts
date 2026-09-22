import { type Address, getAddress } from "viem";
import { z } from "zod";

import type { Status } from "@yotrade/plugin-tournament/phase";

const STATUS = { OPEN: "open", RESULTS_POSTED: "resultsPosted", CANCELLED: "cancelled" } as const;

const bigint = z.string().regex(/^\d+$/).transform(BigInt);
const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value): Address => getAddress(value));

const entrySchema = z.object({
  participant_id: address,
  tradingAccount: address,
  capitalAtJoin: bigint,
  joinedAt: bigint,
  rank: z.number().int().nullable(),
  prize: bigint,
  claimed: z.boolean(),
});

const tournamentSchema = z.object({
  id: bigint,
  organizer: address,
  /** The venue adapter: it decides whether this is a spot or a futures tournament. */
  venue: address,
  prizePool: bigint,
  startingCapital: bigint,
  startTime: bigint,
  endTime: bigint,
  claimableAt: bigint,
  maxParticipants: z.number().int(),
  participantCount: z.number().int(),
  allowlisted: z.boolean(),
  prizeSplitBps: z.array(z.number().int()),
  metadataURI: z.string(),
  status: z.enum(["OPEN", "RESULTS_POSTED", "CANCELLED"]).transform((value): Status => STATUS[value]),
  winners: z.array(address),
});

const ownEntrySchema = entrySchema.extend({ tournament_id: bigint });

/** One futures fill, straight from the `Traded` event: sizes and prices in 1e18. */
const fillSchema = z.object({
  id: z.string(),
  market: z.string(),
  sizeDelta: z.string().regex(/^-?\d+$/).transform(BigInt),
  price: bigint,
  realizedPnl: z.string().regex(/^-?\d+$/).transform(BigInt),
  fee: bigint,
  newSize: z.string().regex(/^-?\d+$/).transform(BigInt),
  timestamp: bigint,
  tx: z.string(),
});

const detailSchema = tournamentSchema.extend({ entries: z.array(entrySchema) });

export type IndexedTournament = z.infer<typeof tournamentSchema>;
export type IndexedEntry = z.infer<typeof entrySchema>;
export type IndexedOwnEntry = z.infer<typeof ownEntrySchema>;
export type IndexedTournamentDetail = z.infer<typeof detailSchema>;
export type IndexedFill = z.infer<typeof fillSchema>;

const TOURNAMENT_FIELDS = `id organizer venue prizePool startingCapital startTime endTime claimableAt maxParticipants
  participantCount allowlisted prizeSplitBps metadataURI status winners`;

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Reads from the Envio indexer. Every response is parsed before it reaches a component. */
export function createIndexer(url: string, fetcher: Fetch = fetch) {
  async function query<T>(
    document: string,
    variables: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: document, variables }),
    });
    if (!response.ok) {
      throw new Error(`Indexer answered ${response.status}`);
    }
    const body = (await response.json()) as { data?: unknown; errors?: { message: string }[] };
    if (body.errors?.length) {
      throw new Error(`Indexer query failed: ${body.errors[0]?.message}`);
    }
    return schema.parse(body.data);
  }

  return {
    /** Newest first. */
    async tournaments(limit = 50): Promise<IndexedTournament[]> {
      const data = await query(
        `query ($limit: Int!) { tournaments: Tournament(order_by: { createdAt: desc }, limit: $limit) { ${TOURNAMENT_FIELDS} } }`,
        { limit },
        z.object({ tournaments: z.array(tournamentSchema) }),
      );
      return data.tournaments;
    },

    /** Entries registered by any of `participants`. Addresses are stored lowercase by the indexer. */
    async entriesOf(participants: readonly Address[]): Promise<IndexedOwnEntry[]> {
      if (participants.length === 0) {
        return [];
      }
      const data = await query(
        `query ($ids: [String!]!) { entries: Entry(where: { participant_id: { _in: $ids } }) {
          tournament_id participant_id tradingAccount capitalAtJoin joinedAt rank prize claimed
        } }`,
        { ids: participants.map((address) => address.toLowerCase()) },
        z.object({ entries: z.array(ownEntrySchema) }),
      );
      return data.entries;
    },

    /** A trader's futures fills in one tournament, newest first. */
    async fillsOf(id: bigint, trader: Address, limit = 50): Promise<IndexedFill[]> {
      const data = await query(
        `query ($entry: String!, $limit: Int!) { fills: Fill(where: { entry_id: { _eq: $entry } }, order_by: { timestamp: desc }, limit: $limit) {
          id market sizeDelta price realizedPnl fee newSize timestamp tx
        } }`,
        { entry: `${id}-${trader.toLowerCase()}`, limit },
        z.object({ fills: z.array(fillSchema) }),
      );
      return data.fills;
    },

    async tournament(id: bigint): Promise<IndexedTournamentDetail | null> {
      const data = await query(
        `query ($id: String!) { tournament: Tournament(where: { id: { _eq: $id } }, limit: 1) { ${TOURNAMENT_FIELDS}
          entries(order_by: { joinedAt: asc }) { participant_id tradingAccount capitalAtJoin joinedAt rank prize claimed }
        } }`,
        { id: id.toString() },
        z.object({ tournament: z.array(detailSchema) }),
      );
      return data.tournament[0] ?? null;
    },
  };
}

export type Indexer = ReturnType<typeof createIndexer>;
