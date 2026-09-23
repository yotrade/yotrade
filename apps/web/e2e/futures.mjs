import { check, finish, open, since } from "./lib.mjs";

/**
 * The whole futures lifecycle on testnet: create, join, long, close, short, finalize with settlement.
 * Sends real transactions and takes about eight minutes; the seeded account needs MON for gas via the drip.
 * E2E_LEVERAGE=100 (or 5) creates the tournament with that cap and trades at a multiple only that cap allows.
 */
const cap = process.env["E2E_LEVERAGE"] ?? "20";
/** A multiple only that cap allows, so the trade proves the cap is in force. */
const MULTIPLE = { 5: "5x", 20: "10x", 100: "50x" };
const { browser, page, logs, shot } = await open("/new");
const failures = [];
const start = Date.now();
const out = {};
try {
  await page.getByRole("button", { name: "Futures", exact: true }).click();
  await page.getByRole("button", { name: `${cap}x`, exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(`Futures Cup ${cap}x`);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Prize pool in USDC").fill("0");
  await page.getByLabel("Prize split").selectOption("Winner takes all");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Starts").selectOption("In 2 minutes");
  await page.getByLabel("Runs for").selectOption("5 minutes");
  await page.getByRole("button", { name: "Create tournament" }).click();
  await page.waitForURL(/\/t\/\d+$/, { timeout: 180_000 });
  out.created = since(start);
  await page.locator("dd", { hasText: `Up to ${cap}x` }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /^Join/ }).click({ timeout: 60_000 });
  await page.getByText("You're in").waitFor({ timeout: 120_000 });
  out.joined = since(start);
  await page.getByRole("link", { name: "Trade" }).click({ timeout: 200_000 });
  await page.getByRole("link", { name: /BTC-PERP/ }).click({ timeout: 60_000 });
  await page.getByRole("button", { name: "Long", exact: true }).click({ timeout: 60_000 });
  await page.getByPlaceholder("0.00").fill("500");
  await page.getByRole("button", { name: MULTIPLE[cap] ?? "10x" }).click();
  await page.getByRole("button", { name: "Long BTC" }).click();
  await page.getByText(/filled$/).waitFor({ timeout: 90_000 });
  out.longFilled = since(start);
  await page.getByRole("button", { name: "Close position" }).click({ timeout: 30_000 });
  await page.getByText(/position closed$/).waitFor({ timeout: 90_000 });
  await page.getByRole("button", { name: "Short", exact: true }).click();
  await page.getByPlaceholder("0.00").fill("300");
  await page.getByRole("button", { name: "Short BTC" }).click();
  await page.getByText(/filled$/).waitFor({ timeout: 90_000 });
  out.shortFilled = since(start);
  await shot("futures-position");
  await page.getByRole("button", { name: /back/i }).first().click();
  await page.getByRole("button", { name: /back/i }).first().click();
  await page.getByRole("button", { name: "Finalize results" }).click({ timeout: 400_000 });
  await page.getByText(/Results in review ·/).waitFor({ timeout: 120_000 });
  out.finalized = since(start);
  await shot("futures-review");
} catch (error) {
  failures.push(String(error).slice(0, 300));
  await shot("futures-failed");
}
check(failures, logs.length === 0, `console: ${logs[0] ?? ""}`);
await browser.close();
finish(out, failures);
