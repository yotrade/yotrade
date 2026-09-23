import type { Venue } from "./venue.ts";

export const JOIN_STEPS = ["gas", "faucet", "deposit", "join"] as const;
export type JoinStep = (typeof JOIN_STEPS)[number];

export class JoinError extends Error {
  override readonly name = "JoinError";
}

/** Chain access the join flow needs. Narrow on purpose: the flow moves money, so it is tested against fakes. */
export interface JoinDeps {
  hasJoined(): Promise<boolean>;
  /** Makes sure the account can pay for gas. */
  fundGas(): Promise<void>;
  walletUsdc(): Promise<bigint>;
  kuruUsdc(): Promise<bigint>;
  canClaimFaucet(): Promise<boolean>;
  claimFaucet(): Promise<unknown>;
  deposit(amount: bigint): Promise<unknown>;
  join(): Promise<unknown>;
}

/**
 * Gas → test funds → Kuru deposit → registration. Every step looks at the chain first, so running it again
 * after a failure resumes instead of repeating a payment.
 */
export async function runJoin(
  deps: JoinDeps,
  startingCapital: bigint,
  onStep: (step: JoinStep) => void,
  venue: Venue = "spot",
): Promise<void> {
  if (await deps.hasJoined()) {
    return;
  }
  onStep("gas");
  await deps.fundGas();

  // Futures capital is virtual: there is nothing to claim or deposit, only a registration.
  if (venue === "futures") {
    onStep("join");
    await deps.join();
    return;
  }

  // Even a tournament without a capital requirement needs a registered Kuru account, which a deposit creates.
  const required = startingCapital > 0n ? startingCapital : 1n;
  let inWallet = await deps.walletUsdc();
  const inKuru = await deps.kuruUsdc();

  if (inWallet + inKuru < required) {
    onStep("faucet");
    if (!(await deps.canClaimFaucet())) {
      throw new JoinError("The Kuru faucet is cooling down for this account. Try again later.");
    }
    await deps.claimFaucet();
    inWallet = await deps.walletUsdc();
    if (inWallet + inKuru < required) {
      throw new JoinError("The faucet does not cover this tournament's starting capital.");
    }
  }

  // Only the starting capital goes in: every trader starts equal, and a size the book can carry stays the
  // natural one. The rest of the claim stays in the wallet.
  const shortfall = required - inKuru;
  if (shortfall > 0n) {
    onStep("deposit");
    await deps.deposit(shortfall < inWallet ? shortfall : inWallet);
  }

  onStep("join");
  await deps.join();
}
