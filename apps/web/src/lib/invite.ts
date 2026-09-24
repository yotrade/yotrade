import type { Identity } from "@yotrade/plugin-mera/plugin";
import { type Address, type Hex, isHex } from "viem";
import { privateKeyToAddress } from "viem/accounts";

/** The link fragment never reaches a server: `/t/7#invite=0x…`. */
const PARAM = "invite";
const STORAGE_PREFIX = "yotrade.invite.";
/** How many rotations the host's key search covers. Rotations are rare; this is far more than enough. */
const MAX_EPOCHS = 32;

export const isInviteCode = (value: string): value is Hex => isHex(value) && value.length === 66;

export function inviteLink(origin: string, id: bigint, code: Hex): string {
  return `${origin}/t/${id}#${PARAM}=${code}`;
}

/** What a guest pastes: the bare code, or a whole invite link whose fragment carries it. */
export function parseInviteCode(input: string): Hex | null {
  const text = input.trim();
  if (isInviteCode(text)) {
    return text;
  }
  const hash = text.indexOf("#");
  return hash === -1 ? null : inviteFromUrl(text.slice(hash));
}

/** The code in the current URL, if any. Read once, then kept for the tournament on this device. */
export function inviteFromUrl(hash: string): Hex | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get(PARAM) ?? "";
  return isInviteCode(value) ? value : null;
}

/**
 * Whether a code is the key of the tournament's current invite signer. Checked before a join, so a code from
 * before the host rotated the invite asks for the new one instead of paying for a join that must revert.
 */
export function inviteMatches(code: Hex, signer: Address): boolean {
  try {
    return privateKeyToAddress(code).toLowerCase() === signer.toLowerCase();
  } catch {
    return false;
  }
}

/** True when the tournament is private and this device holds no code that opens it. */
export function needsInvite(signer: Address | undefined, code: Hex | null): boolean {
  const privateRoom = signer !== undefined && BigInt(signer) !== 0n;
  return privateRoom && !(code !== null && inviteMatches(code, signer));
}

export function loadInvite(id: bigint): Hex | null {
  try {
    const value = localStorage.getItem(STORAGE_PREFIX + id) ?? "";
    return isInviteCode(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveInvite(id: bigint, code: Hex): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + id, code);
  } catch {
    // The link has to be opened again next time.
  }
}

export interface HostInvite {
  readonly code: Hex;
  readonly epoch: number;
}

/**
 * The host's current invite, found by deriving epochs from the passkey until one matches the signer onchain.
 * Nothing is stored: any device with the passkey finds it. Null when the signer is not one of the host's keys.
 */
export function hostInvite(identity: Identity, id: bigint, signer: Address): HostInvite | null {
  const wanted = signer.toLowerCase();
  for (let epoch = 0; epoch < MAX_EPOCHS; epoch += 1) {
    const key = identity.inviteKey(id, epoch);
    if (key.address.toLowerCase() === wanted) {
      return { code: key.privateKey, epoch };
    }
  }
  return null;
}

const PENDING_PREFIX = "yotrade.private-pending.";

/**
 * A room created as private whose invite did not reach the chain: the second transaction of the create failed.
 * Kept on the host's device so the tournament page can finish the job instead of leaving the room open.
 */
export function markPrivatePending(id: bigint, pending: boolean): void {
  try {
    if (pending) {
      localStorage.setItem(PENDING_PREFIX + id, "1");
    } else {
      localStorage.removeItem(PENDING_PREFIX + id);
    }
  } catch {
    // Without storage the host can still make the room private from the tournament page.
  }
}

export function isPrivatePending(id: bigint): boolean {
  try {
    return localStorage.getItem(PENDING_PREFIX + id) === "1";
  } catch {
    return false;
  }
}
