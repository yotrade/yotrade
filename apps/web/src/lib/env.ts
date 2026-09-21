import { z } from "zod";

/**
 * Public configuration, inlined into the browser bundle at build time. Parsed once at module load, so a bad
 * value stops the app at startup instead of surfacing as a broken request later.
 */
const publicSchema = z.object({
  /** Relying-party id for passkeys: the registrable domain the app is served from. */
  NEXT_PUBLIC_RP_ID: z.string().min(1).default("localhost"),
  NEXT_PUBLIC_RPC_URL: z.url().default("https://testnet-rpc.monad.xyz"),
  NEXT_PUBLIC_ALCHEMY_API_KEY: z.string().min(1).optional(),
  /** Envio Cloud GraphQL endpoint. Changes with every indexer deployment on the development plan. */
  NEXT_PUBLIC_INDEXER_URL: z.url().default("https://indexer.dev.hyperindex.xyz/78dbffe/v1/graphql"),
});

export type PublicEnv = z.infer<typeof publicSchema>;

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid public environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

// Next.js only inlines NEXT_PUBLIC_* variables that are referenced literally.
export const publicEnv: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_RP_ID: process.env["NEXT_PUBLIC_RP_ID"],
  NEXT_PUBLIC_RPC_URL: process.env["NEXT_PUBLIC_RPC_URL"],
  NEXT_PUBLIC_ALCHEMY_API_KEY: process.env["NEXT_PUBLIC_ALCHEMY_API_KEY"],
  NEXT_PUBLIC_INDEXER_URL: process.env["NEXT_PUBLIC_INDEXER_URL"],
});
