import { describe, expect, test } from "bun:test";

import { passkeySupport } from "@/lib/browser-support.ts";

const safari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

describe("passkeySupport", () => {
  test("a real browser with WebAuthn passes", () => {
    expect(passkeySupport({ userAgent: safari, hasWebAuthn: true })).toEqual({ ok: true });
  });

  test("in-app browsers are told to open the link outside", () => {
    for (const agent of [
      `${safari} [FBAN/FBIOS;FBAV/400]`,
      `${safari} Instagram 300.0`,
      "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
      `${safari} Discord/200`,
    ]) {
      expect(passkeySupport({ userAgent: agent, hasWebAuthn: true })).toEqual({
        ok: false,
        reason: "webview",
      });
    }
  });

  test("no WebAuthn at all is its own reason", () => {
    expect(passkeySupport({ userAgent: safari, hasWebAuthn: false })).toEqual({
      ok: false,
      reason: "no-webauthn",
    });
  });
});
