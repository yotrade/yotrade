import { describe, expect, test } from "bun:test";

import { describeAuthError } from "../src/lib/auth-error.ts";

describe("describeAuthError", () => {
  test("explains an authenticator without PRF differently from a dismissed prompt", () => {
    const noPrf = describeAuthError({ code: "PRF_UNAVAILABLE" });
    const dismissed = describeAuthError({ code: "PASSKEY_OPERATION_FAILED" });
    expect(noPrf).toContain("cannot derive keys");
    expect(dismissed).toContain("Try again");
    expect(noPrf).not.toBe(dismissed);
  });

  test("names a wrong relying-party domain and a dismissed prompt from the DOM error underneath", () => {
    const security = Object.assign(new Error("x"), { name: "SecurityError" });
    expect(describeAuthError({ code: "PASSKEY_OPERATION_FAILED", cause: security })).toContain(
      "real domain",
    );
    const dismissed = Object.assign(new Error("x"), { name: "NotAllowedError" });
    expect(describeAuthError(dismissed)).toContain("dismissed or timed out");
  });

  test("never leaks raw error text", () => {
    expect(describeAuthError(new Error("secret internals"))).toBe(
      "Something went wrong. Try again.",
    );
    expect(describeAuthError(undefined)).toBe("Something went wrong. Try again.");
  });
});
