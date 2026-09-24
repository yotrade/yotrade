import { describe, expect, test } from "bun:test";

import { clientIp } from "../src/server/client-ip.ts";

describe("clientIp", () => {
  test("trusts what the proxy wrote, never the first forwarded entry", () => {
    expect(
      clientIp(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "6.6.6.6, 1.1.1.1" })),
    ).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
