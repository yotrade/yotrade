import { NextResponse } from "next/server";
import { type Address, createWalletClient, custom, type Hex, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

import { publicEnv } from "@/lib/env.ts";
import { createAppRuntime } from "@/lib/runtime.ts";
import { parseServerEnv } from "@/lib/server-env.ts";
import { createDripper } from "@/server/drip.ts";

export const dynamic = "force-dynamic";

const TRANSFER_GAS = 21_000n;
const bodySchema = z.object({ address: z.string().refine((value) => isAddress(value)) });

function createDrip() {
  const key = parseServerEnv({
    DRIP_PRIVATE_KEY: process.env["DRIP_PRIVATE_KEY"],
  }).DRIP_PRIVATE_KEY;
  if (!key) {
    return null;
  }
  const { publicClient, chain } = createAppRuntime(publicEnv);
  const wallet = createWalletClient({
    account: privateKeyToAccount(key as Hex),
    chain,
    transport: custom(publicClient),
  });
  return createDripper({
    getBalance: (address) => publicClient.getBalance({ address }),
    async send(to, value) {
      // Monad charges the gas limit, so a plain transfer gets exactly what it needs.
      const hash = await wallet.sendTransaction({ to, value, gas: TRANSFER_GAS });
      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
  });
}

// One dripper per server instance: its limits and its send queue are the state.
let drip: ReturnType<typeof createDrip> | undefined;

export async function POST(request: Request) {
  drip ??= createDrip();
  if (!drip) {
    return NextResponse.json({ error: "Drip is not configured" }, { status: 503 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Expected { address }" }, { status: 400 });
  }
  // Vercel overwrites this header with the client address. Behind another proxy a caller could forge it,
  // which only lets them at the global hourly cap, never past it.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  try {
    const result = await drip(body.data.address as Address, ip);
    return NextResponse.json(result, { status: result.status === "limited" ? 429 : 200 });
  } catch {
    return NextResponse.json({ error: "Drip failed, try again shortly" }, { status: 502 });
  }
}
