import { describe, expect, test } from "bun:test";

import { createRuntime } from "@yotrade/core/plugin";
import { custom, verifyMessage } from "viem";
import { monadTestnet } from "viem/chains";

import { mera, type PrfSource } from "../src/plugin.ts";

const offline = custom({ request: () => Promise.resolve("0x279f") });

/** Stands in for an authenticator: the same passkey always evaluates to the same 32 bytes. */
function passkey(fill: number): PrfSource {
  const result = () =>
    Promise.resolve({
      credentialId: `credential-${fill}`,
      prfOutput: new Uint8Array(32).fill(fill),
    });
  return { register: result, signIn: result };
}

const device = (source: PrfSource) =>
  createRuntime({
    chain: monadTestnet,
    transport: offline,
    plugins: [mera({ rp: { id: "yotrade.xyz", name: "YoTrade" }, source })],
  });

describe("mera plugin", () => {
  test("invite keys are deterministic per tournament and epoch, and unrelated to the accounts", async () => {
    const host = await device(passkey(7)).mera.signIn();
    const again = await device(passkey(7)).mera.signIn();
    const first = host.inviteKey(3n, 0);
    expect(again.inviteKey(3n, 0)).toEqual(first);
    expect(host.inviteKey(3n, 1).address).not.toBe(first.address);
    expect(host.inviteKey(4n, 0).address).not.toBe(first.address);
    expect(first.address).not.toBe(host.wallet.account.address);
    expect(first.address).not.toBe(host.tournamentWallet(3n).account.address);
    expect(first.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("a session store brings the identity back without a prompt and forgets it on request", async () => {
    let kept: { credentialId: string; prfOutput: Uint8Array } | null = null;
    const session = {
      load: () => kept,
      save: (result: typeof kept) => {
        kept = result;
      },
      clear: () => {
        kept = null;
      },
    };
    const runtime = createRuntime({
      chain: monadTestnet,
      transport: offline,
      plugins: [mera({ rp: { id: "yotrade.xyz", name: "YoTrade" }, source: passkey(7), session })],
    });
    expect(runtime.mera.resume()).toBeNull();

    const signedIn = await runtime.mera.signIn();
    const resumed = runtime.mera.resume();
    expect(resumed?.wallet.account.address).toBe(signedIn.wallet.account.address);
    expect(resumed?.tournamentWallet(3n).account.address).toBe(
      signedIn.tournamentWallet(3n).account.address,
    );
    // Ending one identity must not wipe the copy the store holds.
    signedIn.end();
    expect(runtime.mera.resume()?.wallet.account.address).toBe(resumed?.wallet.account.address);

    runtime.mera.forget();
    expect(runtime.mera.resume()).toBeNull();
  });

  test("stateless: a fresh device with the same passkey rebuilds the same accounts", async () => {
    const phone = await device(passkey(7)).mera.register({ name: "ayu", displayName: "Ayu" });
    const laptop = await device(passkey(7)).mera.signIn();

    expect(laptop.wallet.account.address).toBe(phone.wallet.account.address);
    expect(laptop.tournamentWallet(3n).account.address).toBe(
      phone.tournamentWallet(3n).account.address,
    );
  });

  test("one passkey, many keys: accounts are distinct per namespace and per user", async () => {
    const ayu = await device(passkey(7)).mera.signIn();
    const budi = await device(passkey(9)).mera.signIn();

    const addresses = [
      ayu.wallet.account.address,
      ayu.tournamentWallet(1n).account.address,
      ayu.tournamentWallet(2n).account.address,
      budi.wallet.account.address,
    ];
    expect(new Set(addresses).size).toBe(4);
    expect(ayu.tournamentWallet(1n)).toBe(ayu.tournamentWallet(1n));
  });

  test("signs without a prompt and the signature verifies against the derived address", async () => {
    const identity = await device(passkey(7)).mera.signIn();
    const signature = await identity.wallet.signMessage({ message: "join tournament 1" });

    expect(
      await verifyMessage({
        address: identity.wallet.account.address,
        message: "join tournament 1",
        signature,
      }),
    ).toBe(true);
  });

  test("the vault is bound to the passkey, not to the device", async () => {
    const note = new TextEncoder().encode("private trade journal");
    const sealed = await (await (await device(passkey(7)).mera.signIn()).vault()).seal(note);

    expect(await (await (await device(passkey(7)).mera.signIn()).vault()).open(sealed)).toEqual(
      note,
    );
    await expect(
      (await (await device(passkey(9)).mera.signIn()).vault()).open(sealed),
    ).rejects.toThrow();
  });

  test("end() wipes the entropy and stops every signer", async () => {
    const prfOutput = new Uint8Array(32).fill(7);
    const source: PrfSource = {
      register: () => Promise.resolve({ credentialId: "c", prfOutput }),
      signIn: () => Promise.resolve({ credentialId: "c", prfOutput }),
    };
    const identity = await device(source).mera.signIn();
    expect(prfOutput.every((byte) => byte === 0)).toBe(true);

    identity.end();
    await expect(identity.wallet.signMessage({ message: "x" })).rejects.toThrow();
    expect(() => identity.tournamentWallet(1n)).toThrow(/ended/);
    expect(() => identity.vault()).toThrow(/ended/);
  });
});
