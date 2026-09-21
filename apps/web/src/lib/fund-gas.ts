import { type Address, type PublicClient, parseEther } from "viem";

/** Enough for a handful of transactions. The drip route tops accounts up well above this. */
const MIN_GAS = parseEther("0.1");

/** How long a fresh drip is given to reach every RPC node before the first transaction is sent. */
const SETTLE_MS = 2_000;

export class GasError extends Error {
  override readonly name = "GasError";
}

/** Makes sure `address` can pay for gas, asking the drip route when it cannot. */
export async function fundGas(publicClient: PublicClient, address: Address): Promise<void> {
  if ((await publicClient.getBalance({ address })) >= MIN_GAS) {
    return;
  }
  const response = await fetch("/api/drip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if ((await publicClient.getBalance({ address })) < MIN_GAS) {
    throw new GasError(
      response.status === 429
        ? "The gas faucet is rate limited. Try again in a few minutes."
        : "The gas faucet is unavailable right now. Try again shortly.",
    );
  }
  // The public RPC is several nodes. The one that takes the next transaction may be a block behind the one
  // that just reported the new balance, and it rejects the sender as unfunded. Two seconds is five blocks.
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}
