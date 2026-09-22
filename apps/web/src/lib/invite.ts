import type { Identity } from "@yotrade/plugin-mera/plugin";
import { type Address, type Hex, isHex } from "viem";

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
