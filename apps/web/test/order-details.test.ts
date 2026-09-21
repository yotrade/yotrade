import { describe, expect, test } from "bun:test";

import { orderDetails } from "../src/lib/order-details.ts";

describe("orderDetails", () => {
  test("a buy reads as quote per base and keeps 0.5 % below the quote as the floor", () => {
    // 2,500 USDC for 0.732861 XAUt0 (both six decimals), the ticket in the owner's screenshot.
    const details = orderDetails(true, 2_500_000_000n, 732_861n, 6, 6);
    expect(details.rate).toBeCloseTo(3411.29, 1);
    expect(details.minimumReceived).toBe(729_196n);
  });

  test("a sell reads the same way round", () => {
    // 0.01 cbBTC (eight decimals) for 761.52 USDC.
    const details = orderDetails(false, 1_000_000n, 761_520_000n, 8, 6);
    expect(details.rate).toBeCloseTo(76_152, 0);
    expect(details.minimumReceived).toBe(757_712_400n);
  });

  test("an empty quote is a rate of zero, not NaN or Infinity", () => {
    expect(orderDetails(true, 1n, 0n, 6, 6).rate).toBe(0);
  });
});
