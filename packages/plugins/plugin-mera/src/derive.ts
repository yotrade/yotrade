import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

/** Bump the version to rotate every derived key at once. */
const DOMAIN = "yotrade/v1";
const KEY_LENGTH = 32;
const MAX_ATTEMPTS = 8;

/**
 * Fixed PRF salt. A constant salt plus a discoverable credential is what makes sign-in stateless: any device
 * holding the passkey recomputes the same entropy with nothing read from storage.
 */
export const PRF_SALT: Uint8Array = sha256(utf8ToBytes(`${DOMAIN}/prf-salt`));

export type Namespace =
  | { readonly kind: "account" }
  | { readonly kind: "tournament"; readonly chainId: number; readonly tournamentId: bigint }
  | { readonly kind: "vault" };

function info(namespace: Namespace, attempt: number): Uint8Array {
  const path =
    namespace.kind === "tournament"
      ? `tournament/${namespace.chainId}/${namespace.tournamentId}`
      : namespace.kind;
  return utf8ToBytes(`${DOMAIN}/${path}#${attempt}`);
}

function assertEntropy(entropy: Uint8Array): void {
  if (entropy.length !== KEY_LENGTH) {
    throw new RangeError(`PRF output must be ${KEY_LENGTH} bytes, got ${entropy.length}`);
  }
}

/** 32 bytes bound to `namespace`. Namespaces are independent: one key reveals nothing about another. */
export function deriveKey(entropy: Uint8Array, namespace: Namespace): Uint8Array {
  assertEntropy(entropy);
  return hkdf(sha256, entropy, undefined, info(namespace, 0), KEY_LENGTH);
}

/**
 * A valid secp256k1 private key for `namespace`. A 32-byte string is outside the curve order with
 * probability ~2^-128; the attempt counter makes that case deterministic instead of a crash.
 */
export function deriveSecp256k1Key(entropy: Uint8Array, namespace: Namespace): Uint8Array {
  assertEntropy(entropy);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = hkdf(sha256, entropy, undefined, info(namespace, attempt), KEY_LENGTH);
    if (secp256k1.utils.isValidSecretKey(candidate)) {
      return candidate;
    }
  }
  throw new Error("Could not derive a valid secp256k1 key");
}
