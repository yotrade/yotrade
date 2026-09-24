import { BaseError, ContractFunctionRevertedError } from "viem";

import { GasError } from "./fund-gas.ts";
import { JoinError } from "./join.ts";

/** A failure the app itself diagnosed, for example a server route that explained itself. Shown as is. */
export class ActionError extends Error {}

/** What each contract revert means to the person who tapped. Names come from the interfaces' `error` lists. */
const REVERTS: Record<string, string> = {
  TournamentFull: "This tournament filled up just now.",
  TournamentEnded: "This tournament has ended.",
  TournamentStarted: "This tournament has already started.",
  TournamentNotEnded: "This tournament is still running.",
  AlreadyJoined: "This account is already in.",
  TradingAccountTaken: "This trading account is already registered in the tournament.",
  NotAllowlisted: "This account is not on the host's list.",
  InvalidInvite: "This invite is no longer valid. Ask the host for a new one.",
  InsufficientStartingCapital: "The account holds less than the starting capital.",
  WrongStatus: "The tournament moved on. What you tapped no longer applies.",
  DisputeWindowActive: "Prizes unlock after the review window.",
  DisputeWindowOver: "The review window has closed.",
  NotWinner: "This account did not place.",
  AlreadyClaimed: "This prize was already claimed.",
  NotOrganizer: "Only the host can do that.",
  GracePeriodActive: "The pool can come back seven days after the end, not before.",
  NothingToSweep: "There is nothing left to sweep.",
  MetadataTooLong: "That is too long to store.",
  TradingClosed: "Trading is closed: this tournament is not running right now.",
  NotAParticipant: "This account is not in the tournament.",
  MarketDisabled: "This market is switched off.",
  PriceTooUncertain: "The oracle price is too uncertain right now. Try again in a moment.",
  ExceedsLeverage: "That would exceed this tournament's leverage cap. Reduce the size.",
  IncorrectFee: "The price update fee changed. Try again.",
  NothingToSettle: "There is nothing to settle.",
  NotLiquidatable: "That position is not liquidatable.",
  ZeroSize: "Enter a size.",
  EnforcedPause: "Trading is paused for a moment. Try again shortly.",
  InvalidPrice: "The oracle sent an unusable price. Try again in a moment.",
  WrongVenue: "This tournament does not trade futures.",
  // Pyth's own errors: not in our ABI, so they are recognised by selector below.
  StalePrice: "The oracle price went stale before the order landed. Try again.",
  PriceFeedNotFound: "The oracle has no price for this market right now.",
  PriceFeedNotFoundWithinRange: "The oracle has no price for that moment yet. Try again shortly.",
  InsufficientFee: "The price update fee changed. Try again.",
  InvalidUpdateData: "The oracle update was rejected. Try again.",
};

/** Selectors of errors raised inside Pyth, which a revert through our contracts carries undecoded. */
const PYTH_SELECTORS: Record<string, string> = {
  "0x19abf40e": "StalePrice",
  "0x14aebe68": "PriceFeedNotFound",
  "0x45805f5d": "PriceFeedNotFoundWithinRange",
  "0x025dbdd4": "InsufficientFee",
  "0xe69ffece": "InvalidUpdateData",
};

/** The contract error name inside a viem error, when the transaction reverted with one. */
export function revertName(cause: unknown): string | undefined {
  if (!(cause instanceof BaseError)) {
    return undefined;
  }
  const revert = cause.walk((error) => error instanceof ContractFunctionRevertedError);
  if (!(revert instanceof ContractFunctionRevertedError)) {
    return undefined;
  }
  return revert.data?.errorName ?? (revert.signature ? PYTH_SELECTORS[revert.signature] : undefined);
}

/**
 * Why an action failed, in the user's terms: the app's own diagnosis when it has one, the contract's reason
 * when the transaction reverted with a named error, and `fallback` for everything else (network, wallet,
 * an unknown revert). `fallback` should say what did not happen and whether to try again.
 */
export function describeFailure(cause: unknown, fallback: string): string {
  if (cause instanceof ActionError || cause instanceof GasError || cause instanceof JoinError) {
    return cause.message;
  }
  const name = revertName(cause);
  return (name && REVERTS[name]) ?? fallback;
}

/** True when the revert says the state has moved on, so repeating the tap cannot help. */
export function isSettled(cause: unknown): boolean {
  const name = revertName(cause);
  return name === "WrongStatus" || name === "AlreadyClaimed" || name === "AlreadyJoined";
}
