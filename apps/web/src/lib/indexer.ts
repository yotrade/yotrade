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

const detailSchema = tournamentSchema.extend({ entries: z.array(entrySchema) });

export type IndexedTournament = z.infer<typeof tournamentSchema>;
export type IndexedEntry = z.infer<typeof entrySchema>;
export type IndexedTournamentDetail = z.infer<typeof detailSchema>;

const TOURNAMENT_FIELDS = `id organizer prizePool startingCapital startTime endTime claimableAt maxParticipants
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
