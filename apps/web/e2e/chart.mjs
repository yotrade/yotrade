import { check, finish, open } from "./lib.mjs";

/** Timeframes change the window, the wheel zooms, a drag pans, reset returns. `E2E_MARKET` is a market path. */
const market = process.env["E2E_MARKET"] ?? "/t/1/trade/cbbtc";
const { browser, page, logs, shot } = await open(market);
const failures = [];
const svg = page.locator("svg[role=img]").first();
const out = {};
for (const tf of ["1m", "15m", "1D"]) {
  await page.getByRole("tab", { name: tf }).click();
  await page.waitForTimeout(5_000);
  out[tf] = await svg.getAttribute("aria-label");
  await shot(`chart-${tf}`);
}
// Gestures on the densest timeframe: a young market has too few daily bars to pan.
await page.getByRole("tab", { name: "1m" }).click();
await page.waitForTimeout(3_000);
const box = await svg.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, -600);
await page.waitForTimeout(400);
out.zoomed = await svg.getAttribute("aria-label");
check(failures, /\b(8\d|9[0-5]) candles/.test(out.zoomed ?? ""), "wheel did not zoom");
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
const reset = page.getByRole("button", { name: /Back to now|reset/ });
const panned = (await reset.count()) === 1;
check(failures, panned, "drag did not pan");
if (panned) {
  await reset.click();
  await page.waitForTimeout(300);
  out.reset = await svg.getAttribute("aria-label");
  check(failures, /96 candles/.test(out.reset ?? ""), "reset did not return to 96");
}
check(failures, logs.length === 0, `console: ${logs[0] ?? ""}`);
await browser.close();
finish(out, failures);
