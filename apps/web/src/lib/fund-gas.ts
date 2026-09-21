import { type Address, type PublicClient, parseEther } from "viem";

/** Enough for a handful of transactions. The drip route tops accounts up well above this. */
const MIN_GAS = parseEther("0.1");

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
}
