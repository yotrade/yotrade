import { z } from "zod";

const privateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "must be a 32-byte hex private key")
  .optional();

/** Server-only configuration. Never import this from a client component. */
const serverSchema = z.object({
  /** Wallet that funds new passkey accounts with testnet MON. Without it the drip route answers 503. */
  DRIP_PRIVATE_KEY: privateKey,
  /** Holds SCORER_ROLE only. Posts results when a tournament ends. Without it finalizing answers 503. */
  SCORER_PRIVATE_KEY: privateKey,
  /** Moonshot AI key for the live commentator. Without it the commentary card stays hidden. */
  KIMI_API_KEY: z.string().min(1).optional(),
  KIMI_BASE_URL: z.url().default("https://api.moonshot.ai/v1"),
  KIMI_MODEL: z.string().min(1).default("kimi-k3"),
  /** Pyth Hermes key for futures price updates. Without it the price proxy answers 503. */
  PYTH_API_KEY: z.string().min(1).optional(),
  PYTH_HERMES_URL: z.url().default("https://pyth.dourolabs.app/hermes"),
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
