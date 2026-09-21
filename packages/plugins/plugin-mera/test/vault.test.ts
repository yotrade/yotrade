import { describe, expect, test } from "bun:test";

import { createVault } from "../src/vault.ts";

const key = new Uint8Array(32).fill(1);
const message = new TextEncoder().encode("long cbBTC, stop at 98k");

describe("vault", () => {
  test("round-trips data", async () => {
    const vault = await createVault(key);
    expect(await vault.open(await vault.seal(message))).toEqual(message);
  });

  test("uses a fresh nonce for every seal", async () => {
    const vault = await createVault(key);
    const [a, b] = await Promise.all([vault.seal(message), vault.seal(message)]);
    expect(a.nonce).not.toEqual(b.nonce);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  test("rejects tampered data and foreign keys", async () => {
    const vault = await createVault(key);
    const sealed = await vault.seal(message);

    const tampered = { nonce: sealed.nonce, ciphertext: sealed.ciphertext.slice() };
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 1;
    await expect(vault.open(tampered)).rejects.toThrow();

    const stranger = await createVault(new Uint8Array(32).fill(2));
    await expect(stranger.open(sealed)).rejects.toThrow();
  });

  test("rejects keys of the wrong size", async () => {
    await expect(createVault(new Uint8Array(16))).rejects.toThrow(RangeError);
  });
});
