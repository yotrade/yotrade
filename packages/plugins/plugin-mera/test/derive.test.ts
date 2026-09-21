import { describe, expect, test } from "bun:test";

import { bytesToHex } from "viem";
import { privateKeyToAddress } from "viem/accounts";

import { deriveKey, deriveSecp256k1Key, PRF_SALT } from "../src/derive.ts";

const entropy = new Uint8Array(32).fill(7);
const other = new Uint8Array(32).fill(8);

describe("pinned vectors", () => {
  test("the PRF salt never changes: a new salt would silently give every user a new account", () => {
    expect(bytesToHex(PRF_SALT)).toBe(
      "0x14cccec738410f76ab9668bef33b6e4f4d8292712fb6d6bf17360bb4f74dd387",
    );
  });

  test("the account derivation never changes", () => {
    const key = deriveSecp256k1Key(new Uint8Array(32).fill(7), { kind: "account" });
    expect(privateKeyToAddress(bytesToHex(key))).toBe("0xecb7f26025725B053797c8beBbb013227E7Ef373");
  });
});

describe("deriveKey", () => {
  test("is deterministic for the same entropy and namespace", () => {
    expect(deriveKey(entropy, { kind: "vault" })).toEqual(
      deriveKey(entropy.slice(), { kind: "vault" }),
    );
  });

  test("separates namespaces, tournaments, chains and users", () => {
    const keys = [
      deriveKey(entropy, { kind: "account" }),
      deriveKey(entropy, { kind: "vault" }),
      deriveKey(entropy, { kind: "tournament", chainId: 10_143, tournamentId: 1n }),
      deriveKey(entropy, { kind: "tournament", chainId: 10_143, tournamentId: 2n }),
      deriveKey(entropy, { kind: "tournament", chainId: 143, tournamentId: 1n }),
      deriveKey(other, { kind: "account" }),
    ].map((key) => bytesToHex(key));

    expect(new Set(keys).size).toBe(keys.length);
  });

  test("rejects entropy that is not 32 bytes", () => {
    expect(() => deriveKey(new Uint8Array(31), { kind: "account" })).toThrow(RangeError);
    expect(() => deriveSecp256k1Key(new Uint8Array(33), { kind: "account" })).toThrow(RangeError);
  });
});

describe("deriveSecp256k1Key", () => {
  test("returns a 32-byte key that differs from the raw namespace key only when a retry was needed", () => {
    const key = deriveSecp256k1Key(entropy, { kind: "account" });
    expect(key).toHaveLength(32);
    expect(key).toEqual(deriveKey(entropy, { kind: "account" }));
  });
});
