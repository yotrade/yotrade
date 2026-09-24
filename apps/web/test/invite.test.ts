import { describe, expect, test } from "bun:test";

import { privateKeyToAddress } from "viem/accounts";

import {
  hostInvite,
  inviteFromUrl,
  inviteLink,
  inviteMatches,
  isInviteCode,
  needsInvite,
  parseInviteCode,
} from "@/lib/invite.ts";

const CODE = `0x${"ab".repeat(32)}` as const;

describe("invite links", () => {
  test("the code travels in the fragment and is read back", () => {
    const link = inviteLink("https://yotrade.xyz", 7n, CODE);
    expect(link).toBe(`https://yotrade.xyz/t/7#invite=${CODE}`);
    expect(inviteFromUrl(new URL(link).hash)).toBe(CODE);
    expect(inviteFromUrl("#invite=nope")).toBeNull();
    expect(inviteFromUrl("")).toBeNull();
    expect(isInviteCode(`0x${"ab".repeat(31)}`)).toBe(false);
  });

  test("the host finds the current epoch from the signer onchain", () => {
    const keys = [0, 1, 2].map((epoch) => ({
      privateKey: `0x${epoch.toString(16).padStart(64, "0")}` as const,
      address: `0x${epoch.toString(16).padStart(40, "0")}` as const,
    }));
    const identity = { inviteKey: (_id: bigint, epoch: number) => keys[epoch] ?? keys[0] } as never;
    expect(hostInvite(identity, 7n, keys[2]?.address ?? "0x")).toEqual({
      code: keys[2]?.privateKey,
      epoch: 2,
    });
    expect(hostInvite(identity, 7n, "0x00000000000000000000000000000000000000ff")).toBeNull();
  });
});

describe("parseInviteCode", () => {
  test("takes the bare code, a whole link, or nothing", () => {
    const code = `0x${"ab".repeat(32)}` as const;
    expect(parseInviteCode(` ${code}\n`)).toBe(code);
    expect(parseInviteCode(`https://app.yotrade.xyz/t/7#invite=${code}`)).toBe(code);
    expect(parseInviteCode("https://app.yotrade.xyz/t/7")).toBeNull();
    expect(parseInviteCode("0x1234")).toBeNull();
  });
});

describe("needsInvite", () => {
  const code = `0x${"11".repeat(32)}` as const;
  const signer = privateKeyToAddress(code);

  test("a public room needs nothing, a private one needs the current signer's key", () => {
    expect(needsInvite(undefined, null)).toBe(false);
    expect(needsInvite("0x0000000000000000000000000000000000000000", null)).toBe(false);
    expect(needsInvite(signer, null)).toBe(true);
    expect(needsInvite(signer, code)).toBe(false);
    expect(inviteMatches(code, signer.toLowerCase() as typeof signer)).toBe(true);
  });

  test("a code from before the host rotated the invite no longer opens the room", () => {
    const old = `0x${"22".repeat(32)}` as const;
    expect(needsInvite(signer, old)).toBe(true);
  });
});
