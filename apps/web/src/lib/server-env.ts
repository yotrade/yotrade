import { z } from "zod";

/** Server-only configuration. Never import this from a client component. */
const serverSchema = z.object({
  /** Wallet that funds new passkey accounts with testnet MON. Without it the drip route answers 503. */
  DRIP_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 32-byte hex private key")
    .optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    // Names only: the values are secrets.
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${names}`);
  }
  return result.data;
}
