import { NextResponse } from "next/server";

import { serverRuntime } from "@/server/runtime.ts";

export const dynamic = "force-dynamic";

const RPC_TIMEOUT_MS = 3_000;

/** Liveness plus the one dependency nothing works without: the chain RPC. */
export async function GET() {
  const runtime = serverRuntime();
  try {
    const block = await Promise.race([
      runtime.publicClient.getBlockNumber(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("RPC timeout")), RPC_TIMEOUT_MS),
      ),
    ]);
    return NextResponse.json({ status: "ok", chainId: runtime.chain.id, block: block.toString() });
  } catch {
    return NextResponse.json({ status: "degraded", chainId: runtime.chain.id }, { status: 503 });
  }
}
