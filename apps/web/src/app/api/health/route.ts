import { NextResponse } from "next/server";

import { serverRuntime } from "@/server/runtime.ts";
import { hotWallets, walletHealth } from "@/server/wallet-health.ts";

export const dynamic = "force-dynamic";

const RPC_TIMEOUT_MS = 3_000;

const withTimeout = <T>(work: Promise<T>) =>
  Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("RPC timeout")), RPC_TIMEOUT_MS),
    ),
  ]);

/**
 * Liveness, the one dependency nothing works without (the chain RPC), and the hot wallets the app spends from.
 * `attention` names the wallets below their floor: still up, but about to stop topping up, scoring or
 * liquidating. Wallet addresses and balances are public onchain anyway.
 */
export async function GET() {
  const runtime = serverRuntime();
  try {
    const block = await withTimeout(runtime.publicClient.getBlockNumber());
    const balances = Object.fromEntries(
      await Promise.all(
        Object.entries(hotWallets()).map(async ([role, address]) => [
          role,
          { address, balance: await withTimeout(runtime.publicClient.getBalance({ address })) },
        ]),
      ),
    );
    const { wallets, attention } = walletHealth(balances);
    return NextResponse.json({
      status: "ok",
      chainId: runtime.chain.id,
      block: block.toString(),
      wallets,
      attention,
    });
  } catch {
    return NextResponse.json({ status: "degraded", chainId: runtime.chain.id }, { status: 503 });
  }
}
